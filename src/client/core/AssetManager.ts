import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, MeshBVH } from 'three-mesh-bvh'; // Import directly for fallbacks

interface AssetEntry {
	scene: THREE.Group; // The original loaded scene
	isLoaded: boolean;
	callbacks: Array<(scene: THREE.Group) => void>;
	// Stores BVH for the *original* geometries from the loaded GLTF
	originalGeometries: Map<THREE.BufferGeometry, MeshBVH | null>; // null if BVH computation failed or not applicable
	customBVHOptions?: BVHOptions;
}

interface BVHOptions {
	maxDepth?: number;
	maxLeafTris?: number;
	verbose?: boolean;
	strategy?: number; // Example: SAH = 0, CENTER = 1, AVERAGE = 2
	// Add any other options supported by three-mesh-bvh's computeBoundsTree
}

export class AssetManager {
	private static instance: AssetManager;
	private assets: Map<string, AssetEntry>;
	private gltfLoader: GLTFLoader;
	private defaultBVHOptions: BVHOptions = {
		maxDepth: 40,
		maxLeafTris: 10,
		verbose: false,
		// strategy: 0, // Example: Use SAH by default if desired
	};

	private constructor() {
		this.assets = new Map();
		this.gltfLoader = new GLTFLoader();
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath('/draco/'); // Ensure this path is correct
		dracoLoader.setDecoderConfig({ type: 'wasm' });
		this.gltfLoader.setDRACOLoader(dracoLoader);

		// It's good practice to ensure these are on the prototype globally once.
		// If CollisionManager or another central place does this, these lines might be redundant.
		if (!THREE.BufferGeometry.prototype.computeBoundsTree) {
			THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
		}
		if (!THREE.BufferGeometry.prototype.disposeBoundsTree) {
			THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
		}
	}

	public static getInstance(): AssetManager {
		if (!AssetManager.instance) {
			AssetManager.instance = new AssetManager();
		}
		return AssetManager.instance;
	}

	public setDefaultBVHOptions(options: BVHOptions): void {
		this.defaultBVHOptions = { ...this.defaultBVHOptions, ...options };
	}

	private cloneWithNewMaterials(originalScene: THREE.Group): THREE.Group {
		const clonedScene = originalScene.clone(true); // true clones geometries and materials initially

		clonedScene.traverse((node: THREE.Object3D) => {
			if ((node as THREE.Mesh).isMesh) {
				const mesh = node as THREE.Mesh;
				// Materials are already cloned by scene.clone(true).
				// If you need to ensure they are truly independent instances (e.g. for unique uniforms later)
				// you might re-clone them here, but scene.clone(true) usually suffices.
				if (Array.isArray(mesh.material)) {
					mesh.material = mesh.material.map((mat) => {
						const newMat = mat.clone();
						newMat.needsUpdate = true; // Good practice
						return newMat;
					});
				} else if (mesh.material) {
					mesh.material = mesh.material.clone();
					mesh.material.needsUpdate = true; // Good practice
				}
				// Geometries are also cloned by scene.clone(true).
				// The shared BVH will be assigned to these cloned geometries later.
			}
		});
		return clonedScene;
	}

	private computeBVHForOriginalGeometries(scene: THREE.Group, url: string): void {
		const assetEntry = this.assets.get(url);
		if (!assetEntry) return;

		assetEntry.originalGeometries.clear(); // Clear any previous attempts for this asset

		scene.traverse((node: THREE.Object3D) => {
			if ((node as THREE.Mesh).isMesh) {
				const mesh = node as THREE.Mesh;
				const geometry = mesh.geometry as THREE.BufferGeometry;

				if (geometry && !assetEntry.originalGeometries.has(geometry)) {
					// Ensure computeBoundsTree is available on this geometry instance
					if (typeof geometry.computeBoundsTree !== 'function') {
						geometry.computeBoundsTree = computeBoundsTree;
					}

					if (geometry.attributes.position) { // BVH requires position attribute
						try {
							const options = assetEntry.customBVHOptions || this.defaultBVHOptions;
							geometry.computeBoundsTree(options); // This computes and assigns to geometry.boundsTree
							if (geometry.boundsTree instanceof MeshBVH) {
								assetEntry.originalGeometries.set(geometry, geometry.boundsTree);
							} else {
								assetEntry.originalGeometries.set(geometry, null); // Mark as attempted but failed
								console.warn(
									`[AssetManager] BVH computation did not result in a MeshBVH instance for a geometry in ${url}. Mesh name: ${mesh.name}`,
								);
							}
						} catch (error) {
							assetEntry.originalGeometries.set(geometry, null); // Mark as attempted but failed
							console.error(
								`[AssetManager] Error computing BVH for a geometry in ${url}. Mesh name: ${mesh.name}`,
								error,
							);
						}
					} else {
						assetEntry.originalGeometries.set(geometry, null); // No position attribute, cannot compute BVH
					}
				}
			}
		});
	}

	private assignSharedBVHToClonedScene(
		clonedScene: THREE.Group,
		originalScene: THREE.Group,
		url: string,
	): void {
		const assetEntry = this.assets.get(url);
		if (!assetEntry || !assetEntry.isLoaded || !assetEntry.originalGeometries.size) {
			return;
		}

		const originalMeshes: THREE.Mesh[] = [];
		originalScene.traverse((node) => {
			if ((node as THREE.Mesh).isMesh) {
				originalMeshes.push(node as THREE.Mesh);
			}
		});

		let clonedMeshIndex = 0;
		clonedScene.traverse((node) => {
			if ((node as THREE.Mesh).isMesh) {
				const clonedMesh = node as THREE.Mesh;
				const clonedGeometry = clonedMesh.geometry as THREE.BufferGeometry;

				if (clonedMeshIndex < originalMeshes.length) {
					const originalMesh = originalMeshes[clonedMeshIndex];
					const originalGeometry = originalMesh.geometry as THREE.BufferGeometry;
					const sharedBVH = assetEntry.originalGeometries.get(originalGeometry);

					if (sharedBVH instanceof MeshBVH) {
						clonedGeometry.boundsTree = sharedBVH;
					}
					// If sharedBVH is null, it means BVH couldn't be computed for the original,
					// so the clone also won't have it.
				}
				clonedMeshIndex++;
			}
		});
		if (clonedMeshIndex !== originalMeshes.length && originalMeshes.length > 0 && clonedMeshIndex > 0) {
			console.warn(
				`[AssetManager] Mesh count mismatch for ${url} during BVH assignment. Original: ${originalMeshes.length}, Cloned processed: ${clonedMeshIndex}. BVH sharing might be incomplete.`,
			);
		}
	}

	public loadAsset(
		url: string,
		callback: (scene: THREE.Group) => void,
		bvhOptions?: BVHOptions,
	): void {
		if (this.assets.has(url)) {
			const assetEntry = this.assets.get(url)!;
			if (assetEntry.isLoaded) {
				const clonedScene = this.cloneWithNewMaterials(assetEntry.scene);
				this.assignSharedBVHToClonedScene(clonedScene, assetEntry.scene, url);
				callback(clonedScene);
			} else {
				// Asset is loading, add callback
				if (bvhOptions && !assetEntry.customBVHOptions) { // Store options if provided during loading phase
					assetEntry.customBVHOptions = bvhOptions;
				}
				assetEntry.callbacks.push(callback);
			}
		} else {
			// Create new asset entry
			const entry: AssetEntry = {
				scene: new THREE.Group(), // Placeholder until loaded
				isLoaded: false,
				callbacks: [callback],
				originalGeometries: new Map(),
				customBVHOptions: bvhOptions,
			};
			this.assets.set(url, entry);

			this.gltfLoader.load(
				url,
				(gltf: GLTF) => {
					const currentEntry = this.assets.get(url); // Re-fetch in case it was cleared
					if (!currentEntry) return;

					currentEntry.scene = gltf.scene;
					currentEntry.isLoaded = true;

					this.computeBVHForOriginalGeometries(currentEntry.scene, url);

					currentEntry.callbacks.forEach((cb) => {
						const clonedScene = this.cloneWithNewMaterials(currentEntry.scene);
						this.assignSharedBVHToClonedScene(clonedScene, currentEntry.scene, url);
						cb(clonedScene);
					});
					currentEntry.callbacks = []; // Clear callbacks after processing
				},
				undefined, // onProgress callback (optional)
				(error: unknown) => {
					console.error(`[AssetManager] Error loading asset ${url}:`, error);
					const failedEntry = this.assets.get(url);
					if (failedEntry) {
						// Optionally, call callbacks with an error or a default model
						failedEntry.callbacks.forEach((cb) => cb(new THREE.Group())); // Example: return empty group
						failedEntry.callbacks = [];
						this.assets.delete(url); // Remove failed entry
					}
				},
			);
		}
	}

	/**
	 * Retrieves the pre-computed BVH for an *original* geometry instance.
	 * This is mainly for internal use or if you have a direct reference to an original geometry.
	 * It will likely return undefined if 'geometry' is from a cloned model, as the BVH
	 * should have been assigned directly to the clone's geometry.boundsTree by loadAsset.
	 */
	public getOriginalBVH(geometry: THREE.BufferGeometry, url: string): MeshBVH | undefined | null {
		const assetEntry = this.assets.get(url);
		if (!assetEntry) return undefined;
		return assetEntry.originalGeometries.get(geometry);
	}

	public getAssetEntry(url: string): AssetEntry | undefined {
		return this.assets.get(url);
	}

	public preloadAsset(url: string, bvhOptions?: BVHOptions): void {
		this.loadAsset(url, () => {/* Preload complete */}, bvhOptions);
	}
}
