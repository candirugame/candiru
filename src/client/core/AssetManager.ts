import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';

interface AssetEntry {
	scene: THREE.Group;
	isLoaded: boolean;
	callbacks: Array<(scene: THREE.Group) => void>;
}

export class AssetManager {
	private static instance: AssetManager;
	private assets: Map<string, AssetEntry>;
	private gltfLoader: GLTFLoader;

	private constructor() {
		this.assets = new Map();
		this.gltfLoader = new GLTFLoader();
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath('/draco/');
		this.gltfLoader.setDRACOLoader(dracoLoader);
	}

	public static getInstance(): AssetManager {
		if (!AssetManager.instance) {
			AssetManager.instance = new AssetManager();
		}
		return AssetManager.instance;
	}

	private cloneWithNewMaterials(scene: THREE.Group): THREE.Group {
		const clonedScene = scene.clone();

		clonedScene.traverse((node: THREE.Object3D) => {
			if ((node as THREE.Mesh).isMesh) {
				const mesh = node as THREE.Mesh;
				if (Array.isArray(mesh.material)) {
					mesh.material = mesh.material.map((mat: THREE.Material) => mat.clone());
				} else {
					mesh.material = mesh.material.clone();
				}
			}
		});

		return clonedScene;
	}

	public loadAsset(url: string, callback: (scene: THREE.Group) => void): void {
		if (this.assets.has(url)) {
			const assetEntry = this.assets.get(url)!;
			if (assetEntry.isLoaded) {
				// Asset is already loaded, clone with new materials
				callback(this.cloneWithNewMaterials(assetEntry.scene));
			} else {
				// Asset is loading, add callback to the list
				assetEntry.callbacks.push(callback);
			}
		} else {
			// Asset not loaded yet, start loading
			this.assets.set(url, { scene: new THREE.Group(), isLoaded: false, callbacks: [callback] });
			this.gltfLoader.load(
				url,
				(gltf: GLTF) => {
					const assetEntry = this.assets.get(url)!;
					assetEntry.scene = gltf.scene;
					assetEntry.isLoaded = true;

					// Call all callbacks waiting for this asset with new material clones
					assetEntry.callbacks.forEach((cb) => {
						cb(this.cloneWithNewMaterials(gltf.scene));
					});
					assetEntry.callbacks = [];
				},
				undefined,
				(error: unknown) => {
					console.error(`Error loading asset ${url}:`, error);
				},
			);
		}
	}

	public preloadAsset(url: string): void {
		this.loadAsset(url, () => {});
	}

	public clearCache(): void {
		this.assets.clear();
	}
}
