import * as THREE from 'three';
import { Renderer } from './Renderer.ts';
import { computeBoundsTree } from 'three-mesh-bvh';
import { CollisionManager } from '../input/CollisionManager.ts';
import { AssetManager } from './AssetManager.ts';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;

export class MapLoader {
	private scene: THREE.Scene;
	private mapObject: THREE.Group | undefined;
	private mapUrl: string = '';

	constructor(renderer: Renderer) {
		this.scene = renderer.getScene();
	}

	public load(mapUrl: string) {
		if (mapUrl === this.mapUrl) return;
		this.mapUrl = mapUrl;
		AssetManager.getInstance().loadAsset(mapUrl, (scene) => {
			if (this.mapObject) this.scene.remove(this.mapObject);
			this.mapObject = scene;
			CollisionManager.staticGeometry(scene);
			this.scene.add(this.mapObject);
		});
	}
	public destroy() {
		if (this.mapObject) {
			this.scene.remove(this.mapObject);
			this.mapObject = undefined;
		}
		this.mapUrl = '';
		// Remove the bounds tree if it exists
		if (this.scene.userData.boundsTree) {
			this.scene.userData.boundsTree.dispose();
			delete this.scene.userData.boundsTree;
		}
	}
}
