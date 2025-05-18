import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { PropData } from '../../shared/Prop.ts'; // Assuming these types exist
import { Networking } from './Networking.ts';
import { AssetManager } from './AssetManager.ts';
import { CollisionManager } from '../input/CollisionManager.ts';

interface PropToRender {
	id: number;
	url: string;
	object?: THREE.Group;
	isLoading: boolean;
	serverData: PropData; // Stores the latest authoritative state from the server (targets for interpolation)
}

export class PropRenderer {
	private scene: THREE.Scene;
	private networking: Networking;
	private assetManager = AssetManager.getInstance();
	private propsToRender = new Map<number, PropToRender>();

	private deltaTime: number = 0;
	// A value of 0.1 means it covers ~10% of the distance to the target per frame at 60FPS.
	private readonly INTERPOLATION_RATE = 0.10;

	// Reusable objects for interpolation to avoid allocations in the loop
	private tempTargetPosition = new THREE.Vector3();
	private tempTargetQuaternion = new THREE.Quaternion();

	constructor(scene: THREE.Scene, networking: Networking) {
		this.scene = scene;
		this.networking = networking;

		// Ensure BVH methods are available (can be done globally too)
		if (!THREE.BufferGeometry.prototype.computeBoundsTree) {
			THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
		}
		if (!THREE.BufferGeometry.prototype.disposeBoundsTree) {
			THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
		}
	}

	public onFrame(deltaTime: number): void {
		this.deltaTime = deltaTime;
		const interpolationAlpha = Math.min(1, this.INTERPOLATION_RATE * this.deltaTime * 60); // Cap at 1 to prevent overshooting if deltaTime is huge

		// 1) Sync props with server data (updates targets, handles new/removed props)
		const allPropData = this.networking.getPropData();
		const currentServerIds = new Set<number>();

		for (const pd of allPropData) {
			currentServerIds.add(pd.id);
			const existingEntry = this.propsToRender.get(pd.id);

			if (existingEntry) {
				this.updateProp(existingEntry, pd); // Updates serverData (target) and handles non-interpolated changes
			} else {
				this.addNewProp(pd); // Adds new prop and sets its initial state directly
			}
		}

		// 2) Remove any props no longer present on the server
		for (const id of Array.from(this.propsToRender.keys())) {
			if (!currentServerIds.has(id)) {
				this.removeProp(id);
			}
		}

		// 3) Interpolate visual state for all loaded props
		for (const entry of this.propsToRender.values()) {
			if (entry.object && !entry.isLoading) {
				// Set target position and quaternion from the latest server data
				this.tempTargetPosition.set(
					entry.serverData.position.x,
					entry.serverData.position.y,
					entry.serverData.position.z,
				);
				this.tempTargetQuaternion.set(
					entry.serverData.quaternion.x,
					entry.serverData.quaternion.y,
					entry.serverData.quaternion.z,
					entry.serverData.quaternion.w,
				);

				// Interpolate position
				entry.object.position.lerp(this.tempTargetPosition, interpolationAlpha);

				// Interpolate rotation
				entry.object.quaternion.slerp(this.tempTargetQuaternion, interpolationAlpha);

				// Scale is applied directly in updateProp/addNewProp, not interpolated here.
			}
		}

		// 4) Update collision manager
		// This will use the (now interpolated) positions of the prop objects.
		// If highly precise, server-authoritative collision is needed, this might require adjustment.
		CollisionManager.updateDynamicColliders(this.getCollidablePropObjects());
	}

	public getCollidablePropObjects(): THREE.Group[] {
		return Array.from(this.propsToRender.values())
			.filter((e) => e.object && !e.isLoading && e.serverData.playersCollide)
			.map((e) => e.object!);
	}

	public destroy() {
		this.clearAllProps();
	}

	private addNewProp(propData: PropData): void {
		const newEntry: PropToRender = {
			id: propData.id,
			url: propData.url,
			isLoading: true,
			serverData: { ...propData }, // Store a copy of the initial server data
		};
		this.propsToRender.set(propData.id, newEntry);

		this.assetManager.loadAsset(propData.url, (model) => {
			const current = this.propsToRender.get(propData.id);
			// Check if the prop is still relevant (e.g., not removed while loading, URL hasn't changed)
			if (!current || current.url !== propData.url) {
				if (model.parent) model.parent.remove(model);
				// Potentially dispose of model resources if AssetManager doesn't handle it
				return;
			}

			current.object = model;
			current.isLoading = false;

			// Apply the initial state directly, no interpolation needed for the first appearance.
			// Ensure we use the latest serverData for this prop, in case it updated during load.
			this.applyInitialModelState(model, current.serverData);
			this.manageBVHForProp(model, current.serverData, false); // Initial BVH setup
			this.scene.add(model);
		});
	}

	private applyInitialModelState(model: THREE.Group, propData: PropData): void {
		model.position.set(propData.position.x, propData.position.y, propData.position.z);
		model.quaternion.set(propData.quaternion.x, propData.quaternion.y, propData.quaternion.z, propData.quaternion.w);
		model.scale.set(propData.scale.x, propData.scale.y, propData.scale.z);
		this.updateModelUserData(model, propData);
	}

	private updateModelUserData(model: THREE.Group, propData: PropData): void {
		model.userData.propId = propData.id;
		model.userData.playersCollide = propData.playersCollide;
		model.userData.propName = propData.name;
		// model.userData.bvhComputed is managed in manageBVHForProp
	}

	private updateProp(entry: PropToRender, newData: PropData): void {
		const oldData = entry.serverData;

		// If the model URL changes, we need to reload it.
		if (entry.url !== newData.url) {
			this.removeProp(entry.id); // Handles disposal of the old object and its BVH
			this.addNewProp(newData); // Adds the new prop
			return;
		}

		// Update the stored serverData. This becomes the new target for interpolation.
		entry.serverData = { ...newData };

		if (entry.object && !entry.isLoading) {
			// Apply scale changes directly (not interpolated)
			const scaleChanged = !this.areScalesEqual(oldData, newData);
			if (scaleChanged) {
				entry.object.scale.set(newData.scale.x, newData.scale.y, newData.scale.z);
			}

			// Update user data which might have changed
			this.updateModelUserData(entry.object, newData);

			// Manage BVH if collision properties or scale changed
			const collisionToggled = oldData.playersCollide !== newData.playersCollide;
			let needsBVHManagement = false;
			let forceGeometryRecomputeForBVH = false;

			if (collisionToggled) {
				needsBVHManagement = true;
				if (newData.playersCollide && scaleChanged) {
					forceGeometryRecomputeForBVH = true;
				}
			} else if (newData.playersCollide) { // Stays collidable
				if (scaleChanged) {
					needsBVHManagement = true;
					forceGeometryRecomputeForBVH = true;
				} else if (!entry.object.userData.bvhComputed) {
					needsBVHManagement = true; // Needs setup if not already computed
				} else {
					// Sanity check for BVH existence if flagged as computed
					let bvhMissingOnMeshes = false;
					entry.object.traverse((o) => {
						if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.boundsTree) {
							bvhMissingOnMeshes = true;
						}
					});
					if (bvhMissingOnMeshes) {
						console.warn(
							`[PropRenderer] Prop ${newData.id} (URL: ${newData.url}) had bvhComputed=true but BVH was missing. Re-managing.`,
						);
						needsBVHManagement = true;
					}
				}
			}
			// If it became non-collidable, manageBVHForProp will handle disposal.

			if (needsBVHManagement) {
				this.manageBVHForProp(entry.object, newData, forceGeometryRecomputeForBVH);
			}
		}
	}

	private manageBVHForProp(
		model: THREE.Group,
		propData: PropData, // Use current propData for playersCollide flag
		forceRecomputeGeometry: boolean,
	): void {
		if (propData.playersCollide) {
			let needsBVHSetup = false;
			if (forceRecomputeGeometry) { // e.g. scale changed
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh) {
						const mesh = o as THREE.Mesh;
						const geom = mesh.geometry as THREE.BufferGeometry;
						if (geom.boundsTree) {
							typeof geom.disposeBoundsTree === 'function' ? geom.disposeBoundsTree() : disposeBoundsTree.call(geom);
						}
						geom.boundsTree = undefined!; // Explicitly clear
					}
				});
				needsBVHSetup = true; // Must recompute after disposal
			} else {
				// Check if BVH is missing on any mesh if not forcing recompute
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.boundsTree) {
						needsBVHSetup = true; // Found a mesh needing BVH
					}
				});
			}

			// If the main model flag indicates BVH wasn't computed, it also needs setup
			if (!model.userData.bvhComputed) {
				needsBVHSetup = true;
			}

			if (needsBVHSetup) {
				// console.log(`[PropRenderer] Setting up BVH for prop ${propData.id} (URL: ${propData.url}), forceRecompute: ${forceRecomputeGeometry}`);
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh) {
						const mesh = o as THREE.Mesh;
						const geom = mesh.geometry as THREE.BufferGeometry;
						if (!geom.boundsTree || forceRecomputeGeometry) { // Only compute if missing or forced
							const sharedBVH = this.assetManager.getOriginalBVH(geom, propData.url);
							if (sharedBVH && !forceRecomputeGeometry) {
								geom.boundsTree = sharedBVH;
							} else {
								typeof geom.computeBoundsTree === 'function' ? geom.computeBoundsTree() : computeBoundsTree.call(geom);
							}
						}
					}
				});
				model.userData.bvhComputed = true;
			}
		} else { // Not collidable
			if (model.userData.bvhComputed) { // Only dispose if it thought it had one
				// console.log(`[PropRenderer] Disposing BVH for prop ${propData.id} (URL: ${propData.url}) as it's no longer collidable.`);
				model.traverse((o) => {
					if ((o as THREE.Mesh).isMesh) {
						const mesh = o as THREE.Mesh;
						const geom = mesh.geometry as THREE.BufferGeometry;
						if (geom.boundsTree) {
							typeof geom.disposeBoundsTree === 'function' ? geom.disposeBoundsTree() : disposeBoundsTree.call(geom);
							geom.boundsTree = undefined!;
						}
					}
				});
				model.userData.bvhComputed = false;
			}
		}
	}

	private removeProp(propId: number): void {
		const entry = this.propsToRender.get(propId);
		if (!entry) return;

		if (entry.object) {
			// Ensure BVH is disposed if it was collidable or flagged as computed
			if (entry.object.userData.bvhComputed || entry.serverData.playersCollide) {
				// Pass a modified PropData to ensure playersCollide=false for disposal logic
				this.manageBVHForProp(
					entry.object,
					{ ...entry.serverData, playersCollide: false },
					false, // Not forcing geometry recompute, just ensuring disposal
				);
			}
			this.scene.remove(entry.object);
			// AssetManager should handle whether to dispose of geometry/materials
			// if they are shared or unique.
		}
		this.propsToRender.delete(propId);
	}

	public clearAllProps(): void {
		for (const id of Array.from(this.propsToRender.keys())) {
			this.removeProp(id);
		}
		this.propsToRender.clear(); // Should be empty, but good for safety
		console.log('[PropRenderer] All props cleared.');
		CollisionManager.updateDynamicColliders([]);
	}

	private areScalesEqual(
		a: PropData, // Assuming PropDataScale is { x: number; y: number; z: number }
		b: PropData,
	): boolean {
		const e = 1e-5; // Epsilon for floating point comparison
		return (
			Math.abs(a.scale.x - b.scale.x) < e &&
			Math.abs(a.scale.y - b.scale.y) < e &&
			Math.abs(a.scale.z - b.scale.z) < e
		);
	}

	public getPropObjects(): THREE.Object3D[] {
		return Array.from(this.propsToRender.values())
			.filter((e) => e.object && !e.isLoading)
			.map((e) => e.object!);
	}

	public getShotVectorsToProps(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number = Infinity): { propID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		const result: { propID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] = [];
		const raycaster = new THREE.Raycaster(origin, direction.clone().normalize(), 0, maxDistance);
		
		// Get all prop objects that are loaded
		const propObjects: THREE.Object3D[] = this.getPropObjects();
		
		// Check for intersections with props
		const intersects = raycaster.intersectObjects(propObjects, true);
		
		// Process intersections
		for (const intersection of intersects) {
			// Find the root prop object from the intersected object
			let rootObject: THREE.Object3D | null = intersection.object;
			while (rootObject && rootObject.parent && !rootObject.userData.propId) {
				rootObject = rootObject.parent;
			}
			
			if (rootObject && rootObject.userData.propId !== undefined) {
				const propID = rootObject.userData.propId;
				result.push({
					propID,
					vector: new THREE.Vector3().subVectors(intersection.point, origin),
					hitPoint: intersection.point,
				});
				
				// Only return the first hit for a prop
				break;
			}
		}
		
		return result;
	}

	public getShotVectorsToPropsWithWallCheck(
		origin: THREE.Vector3, 
		direction: THREE.Vector3, 
		maxDistance: number = Infinity,
		mapObject: THREE.Mesh
	): { propID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		const result: { propID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] = [];
		const raycaster = new THREE.Raycaster(origin, direction.clone().normalize(), 0, maxDistance);
		
		// Get all prop objects that are loaded
		const propObjects: THREE.Object3D[] = this.getPropObjects();
		
		// Check for intersections with props
		const propIntersects = raycaster.intersectObjects(propObjects, true);
		
		// Check for intersections with walls (using firstHitOnly for efficiency)
		raycaster.firstHitOnly = true;
		const wallIntersects = raycaster.intersectObject(mapObject);
		raycaster.firstHitOnly = false;
		
		// Filter out prop intersections that are behind walls
		const filteredPropIntersects = propIntersects.filter((propIntersect) => {
			// Check if any wall is closer than this prop
			for (const wallIntersect of wallIntersects) {
				if (wallIntersect.distance < propIntersect.distance) {
					return false;
				}
			}
			return true;
		});
		
		// Process intersections
		for (const intersection of filteredPropIntersects) {
			// Find the root prop object from the intersected object
			let rootObject: THREE.Object3D | null = intersection.object;
			while (rootObject && rootObject.parent && !rootObject.userData.propId) {
				rootObject = rootObject.parent;
			}
			
			if (rootObject && rootObject.userData.propId !== undefined) {
				const propID = rootObject.userData.propId;
				result.push({
					propID,
					vector: new THREE.Vector3().subVectors(intersection.point, origin),
					hitPoint: intersection.point,
				});
				
				// Only return the first hit for a prop
				break;
			}
		}
		
		return result;
	}
}
