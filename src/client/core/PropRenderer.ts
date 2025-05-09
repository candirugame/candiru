import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { PropData } from '../../shared/Prop.ts';
import { Networking } from './Networking.ts';
import { AssetManager } from './AssetManager.ts';
import { CollisionManager } from '../input/CollisionManager.ts';

interface PropToRender {
	id: number;
	url: string;
	object?: THREE.Group;
	isLoading: boolean;
	serverData: PropData;
}

export class PropRenderer {
	private scene: THREE.Scene;
	private networking: Networking;
	private assetManager = AssetManager.getInstance();
	private propsToRender = new Map<number, PropToRender>();

	constructor(scene: THREE.Scene, networking: Networking) {
		this.scene = scene;
		this.networking = networking;

		// Ensure BVH methods are available on BufferGeometry prototype
		// This might also be done in CollisionManager or globally elsewhere
		if (!THREE.BufferGeometry.prototype.computeBoundsTree) {
			THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
		}
		if (!THREE.BufferGeometry.prototype.disposeBoundsTree) {
			THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
		}
	}

	public onFrame(_deltaTime: number): void {
		// 1) Sync props with server
		const allPropData = this.networking.getPropData();
		const currentIds = new Set<number>();

		for (const pd of allPropData) {
			currentIds.add(pd.id);
			const entry = this.propsToRender.get(pd.id);
			if (entry) {
				this.updateProp(entry, pd);
			} else {
				this.addNewProp(pd);
			}
		}

		// 2) Remove any props no longer on server
		for (const id of Array.from(this.propsToRender.keys())) {
			if (!currentIds.has(id)) {
				this.removeProp(id);
			}
		}

		// 3) Update collision manager
		CollisionManager.updateDynamicColliders(this.getCollidablePropObjects());
	}

	public getCollidablePropObjects(): THREE.Group[] {
		return Array.from(this.propsToRender.values())
			.filter((e) => e.object && !e.isLoading && e.serverData.playersCollide)
			.map((e) => e.object!);
	}

	private addNewProp(propData: PropData): void {
		const newEntry: PropToRender = {
			id: propData.id,
			url: propData.url,
			isLoading: true,
			serverData: { ...propData }, // Store a copy
		};
		this.propsToRender.set(propData.id, newEntry);

		this.assetManager.loadAsset(propData.url, (model) => {
			const current = this.propsToRender.get(propData.id);
			if (!current || current.url !== propData.url) { // Check if still relevant
				if (model.parent) model.parent.remove(model); // Clean up if model was loaded but entry removed
				return;
			}

			current.object = model;
			current.isLoading = false;
			// Server data might have updated while loading, use the latest
			// current.serverData = { ...propData }; // Already set, but ensure it's the one from the map

			this.applyCorePropDataToModel(model, current.serverData);
			this.manageBVHForProp(model, current.serverData, false); // Initial BVH setup
			this.scene.add(model);
		});
	}

	private updateProp(entry: PropToRender, newData: PropData): void {
		const oldData = entry.serverData;

		if (entry.url !== newData.url) {
			this.removeProp(entry.id); // This will handle BVH disposal of the old object
			this.addNewProp(newData);
			return;
		}

		entry.serverData = { ...newData }; // Update server data

		if (entry.object && !entry.isLoading) {
			this.applyCorePropDataToModel(entry.object, newData);

			const scaleChanged = !this.areScalesEqual(oldData.scale, newData.scale);
			const collisionToggled = oldData.playersCollide !== newData.playersCollide;
			let needsBVHManagement = false;
			let forceGeometryRecompute = false;

			if (collisionToggled) {
				needsBVHManagement = true;
				// If it became collidable and scale changed, force recompute.
				// If it became non-collidable, manageBVH will dispose.
				// If it became collidable and scale didn't change, no force recompute needed, just setup.
				if (newData.playersCollide && scaleChanged) {
					forceGeometryRecompute = true;
				}
			} else if (newData.playersCollide) { // Stays collidable or was already collidable
				if (scaleChanged) {
					needsBVHManagement = true;
					forceGeometryRecompute = true;
				} else if (!entry.object.userData.bvhComputed) {
					// Flag indicates it wasn't set up, or was reset
					needsBVHManagement = true;
				} else {
					// It's collidable, scale didn't change, bvhComputed is true.
					// Sanity check for the server reboot scenario: ensure BVH actually exists.
					let bvhMissingOnMeshes = false;
					entry.object.traverse((o) => {
						if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.boundsTree) {
							bvhMissingOnMeshes = true;
						}
					});
					if (bvhMissingOnMeshes) {
						console.warn(
							`[PropRenderer] Prop ${newData.id} had bvhComputed=true but BVH was missing on meshes. Re-managing.`,
						);
						needsBVHManagement = true;
						// forceGeometryRecompute remains false, we just need to set up existing geometry
					}
				}
			}
			// If it's not collidable and wasn't (collisionToggled is false), no BVH management needed unless it was previously collidable.
			// manageBVHForProp handles the case where playersCollide becomes false.

			if (needsBVHManagement) {
				this.manageBVHForProp(entry.object, newData, forceGeometryRecompute);
			}
		}
	}

	private manageBVHForProp(
		model: THREE.Group,
		propData: PropData,
		forceRecomputeGeometry: boolean,
	): void {
		if (propData.playersCollide) {
			let needsBVHSetup = false;

			if (forceRecomputeGeometry) {
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh) {
						const mesh = o as THREE.Mesh;
						const geom = mesh.geometry as THREE.BufferGeometry;
						if (geom.boundsTree) { // Check if disposeBoundsTree is a function
							if (typeof geom.disposeBoundsTree === 'function') {
								geom.disposeBoundsTree();
							} else { // Fallback if disposeBoundsTree is not on this specific geometry instance
								disposeBoundsTree.call(geom);
							}
						}
						geom.boundsTree = undefined!; // Explicitly clear
					}
				});
				needsBVHSetup = true;
			} else {
				// Check if BVH is missing on any mesh
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.boundsTree) {
						needsBVHSetup = true;
					}
				});
			}

			// If the main flag indicates it wasn't computed, it also needs setup
			if (!model.userData.bvhComputed) {
				needsBVHSetup = true;
			}

			if (needsBVHSetup) {
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh) {
						const mesh = o as THREE.Mesh;
						const geom = mesh.geometry as THREE.BufferGeometry;

						// Only compute if it's actually missing or forced
						if (!geom.boundsTree || forceRecomputeGeometry) {
							// Attempt to get shared BVH (AssetManager should handle this ideally)
							// For now, if AssetManager doesn't provide it, we compute.
							const sharedBVH = this.assetManager.getOriginalBVH(geom, propData.url);

							if (sharedBVH && !forceRecomputeGeometry) {
								geom.boundsTree = sharedBVH;
							} else {
								// Ensure computeBoundsTree is available
								if (typeof geom.computeBoundsTree !== 'function') {
									geom.computeBoundsTree = computeBoundsTree; // Monkey-patch if missing on this instance
								}
								geom.computeBoundsTree(); // Compute for this instance
							}
						}
					}
				});
				model.userData.bvhComputed = true;
			}
		} else {
			// No longer collidable: dispose BVH if it had one
			if (model.userData.bvhComputed) { // Only dispose if it thought it had one
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh) {
						const mesh = o as THREE.Mesh;
						const geom = mesh.geometry as THREE.BufferGeometry;
						if (geom.boundsTree) {
							if (typeof geom.disposeBoundsTree === 'function') {
								geom.disposeBoundsTree();
							} else {
								disposeBoundsTree.call(geom);
							}
							geom.boundsTree = undefined!;
						}
					}
				});
				model.userData.bvhComputed = false;
			}
		}
	}

	private applyCorePropDataToModel(
		model: THREE.Group,
		propData: PropData,
	): void {
		model.position.set(propData.position.x, propData.position.y, propData.position.z);
		model.quaternion.set(propData.quaternion.x, propData.quaternion.y, propData.quaternion.z, propData.quaternion.w);
		model.scale.set(propData.scale.x, propData.scale.y, propData.scale.z);

		model.userData.propId = propData.id;
		model.userData.playersCollide = propData.playersCollide; // Store for reference
		model.userData.propName = propData.name;
		// model.userData.bvhComputed is managed in manageBVHForProp
	}

	private removeProp(propId: number): void {
		const entry = this.propsToRender.get(propId);
		if (!entry) return;

		if (entry.object) {
			// Ensure BVH is disposed if it was collidable or thought it was computed
			if (entry.object.userData.bvhComputed || entry.serverData.playersCollide) {
				this.manageBVHForProp(
					entry.object,
					{ ...entry.serverData, playersCollide: false }, // Temporarily mark as non-collidable for disposal logic
					false, // Not forcing geometry recompute, just disposal
				);
			}
			this.scene.remove(entry.object);
			// Note: If AssetManager clones geometries, they will be disposed with the object.
			// If AssetManager shares geometries, they should not be disposed here.
			// Three.js GLTFLoader typically creates unique geometries per load unless explicitly shared.
		}
		this.propsToRender.delete(propId);
	}

	/**
	 * Clears all props from the renderer. Useful for full state resets, e.g., on new server connection.
	 */
	public clearAllProps(): void {
		for (const id of Array.from(this.propsToRender.keys())) {
			this.removeProp(id); // removeProp handles BVH disposal and scene removal
		}
		// propsToRender is already cleared by removeProp, but an explicit clear is fine.
		this.propsToRender.clear();
		console.log('[PropRenderer] All props cleared.');
		CollisionManager.updateDynamicColliders([]); // Also clear colliders in CollisionManager
	}

	private areScalesEqual(
		a: { x: number; y: number; z: number },
		b: { x: number; y: number; z: number },
	): boolean {
		const e = 1e-5; // Epsilon for float comparison
		return (
			Math.abs(a.x - b.x) < e &&
			Math.abs(a.y - b.y) < e &&
			Math.abs(a.z - b.z) < e
		);
	}

	/** Optional: get all prop Objects (collidable or not) */
	public getPropObjects(): THREE.Object3D[] {
		return Array.from(this.propsToRender.values())
			.filter((p) => p.object && !p.isLoading)
			.map((p) => p.object!);
	}
}
