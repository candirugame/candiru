import * as THREE from 'three';
import { Renderer } from './Renderer.ts';
import { computeBoundsTree } from 'three-mesh-bvh';
import { CollisionManager } from '../input/CollisionManager.ts';
import { AssetManager } from './AssetManager.ts';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;

export interface ClientMapJson {
	name: string;
	respawnPoints?: unknown[];
	itemRespawnPoints?: unknown[];
	capturePoints?: unknown[];
	props?: unknown[];
	staticPropExclusions?: string[];
}

export class MapLoader {
	private scene: THREE.Scene;
	private mapObject: THREE.Group | undefined;
	private mapUrl: string = '';
	private mapJson: ClientMapJson | null = null;
	private mapJsonUrl: string = '';

	constructor(renderer: Renderer) {
		this.scene = renderer.getScene();
	}

	public load(mapUrl: string) {
		if (mapUrl === this.mapUrl) return;
		this.mapUrl = mapUrl;
		const mapJsonPromise = this.loadMapJson(mapUrl);
		AssetManager.getInstance().loadAsset(mapUrl, (scene) => {
			mapJsonPromise.then((mapJson) => {
				this.mapJson = mapJson;
				this.applyStaticPropExclusions(scene, mapJson?.staticPropExclusions ?? []);
			}).finally(() => {
				if (this.mapObject) this.scene.remove(this.mapObject);
				this.mapObject = scene;
				CollisionManager.staticGeometry(scene);
				this.scene.add(this.mapObject);
			});
		});
	}

	public getMapObject(): THREE.Group | undefined {
		return this.mapObject;
	}

	public getMapJson(): ClientMapJson | null {
		return this.mapJson;
	}

	public getMapJsonUrl(): string {
		return this.mapJsonUrl;
	}

	public findStaticNodeByName(name: string): THREE.Object3D | null {
		if (!this.mapObject) return null;
		let result: THREE.Object3D | null = null;
		this.mapObject.traverse((node) => {
			if (!result && node.name === name) result = node;
		});
		return result;
	}

	private async loadMapJson(mapUrl: string): Promise<ClientMapJson | null> {
		this.mapJsonUrl = mapUrl.replace(/\/map\.glb(?:\?.*)?$/, '/map.json');
		if (!this.mapJsonUrl || this.mapJsonUrl === mapUrl) return null;
		try {
			const response = await fetch(this.mapJsonUrl);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return await response.json();
		} catch (error) {
			console.warn(`[MapLoader] Failed to load map metadata ${this.mapJsonUrl}:`, error);
			return null;
		}
	}

	private applyStaticPropExclusions(scene: THREE.Group, exclusions: string[]): void {
		if (exclusions.length === 0) return;
		const excludedNames = new Set(exclusions);
		scene.traverse((node) => {
			if (node.name && excludedNames.has(node.name)) {
				node.visible = false;
				node.userData.staticPropExcluded = true;
			}
		});
	}

	public destroy() {
		if (this.mapObject) {
			this.scene.remove(this.mapObject);
			this.mapObject = undefined;
		}
		this.mapUrl = '';
		this.mapJson = null;
		this.mapJsonUrl = '';
		// Remove the bounds tree if it exists
		if (this.scene.userData.boundsTree) {
			this.scene.userData.boundsTree.dispose();
			delete this.scene.userData.boundsTree;
		}
	}
}
