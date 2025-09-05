import * as THREE from 'three';
import {
	acceleratedRaycast,
	computeBoundsTree,
	disposeBoundsTree,
	MeshBVH,
	StaticGeometryGenerator,
} from 'three-mesh-bvh';
import { InputHandler } from './InputHandler.ts';
import { RemotePlayerRenderer } from '../core/RemotePlayerRenderer.ts';
import { Player } from '../../shared/Player.ts';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

export class CollisionManager {
	private clock: THREE.Clock;
	private readonly colliderSphere: THREE.Sphere;
	private readonly deltaVec: THREE.Vector3; // Used for world-space calculations (map) and local for props before conversion
	private readonly prevPosition: THREE.Vector3;
	public static mapLoaded: boolean = false;
	private static staticMapBvh?: MeshBVH; // Store the BVH for the static map
	private static dynamicColliders: THREE.Object3D[] = []; // Store collidable prop objects

	private inputHandler: InputHandler;
	private static readonly maxAngle: number = Math.cos(45 * Math.PI / 180);
	private readonly triNormal: THREE.Vector3; // Used for world-space calculations (map) and local for props before conversion
	private readonly upVector: THREE.Vector3;
	private coyoteTime: number;
	private jumped: boolean;
	private collided: boolean;
	private readonly velocity: THREE.Vector3;

	// Temporary objects for prop collision calculations to avoid re-allocation
	private readonly tempLocalSphere: THREE.Sphere;
	private readonly tempDeltaVec: THREE.Vector3;
	private readonly tempTriNormal: THREE.Vector3;
	private readonly worldToLocalMatrix: THREE.Matrix4;

	constructor(inputHandler: InputHandler) {
		this.inputHandler = inputHandler;
		this.clock = new THREE.Clock();
		this.colliderSphere = new THREE.Sphere(new THREE.Vector3(), .2);
		this.deltaVec = new THREE.Vector3();
		this.prevPosition = new THREE.Vector3();
		this.triNormal = new THREE.Vector3();
		this.upVector = new THREE.Vector3(0, 1, 0);
		this.coyoteTime = 0;
		this.jumped = false;
		this.collided = false;
		this.velocity = new THREE.Vector3(0, 0, 0);

		// Initialize temporary objects for prop collisions
		this.tempLocalSphere = new THREE.Sphere(new THREE.Vector3(), this.colliderSphere.radius);
		this.tempDeltaVec = new THREE.Vector3();
		this.tempTriNormal = new THREE.Vector3();
		this.worldToLocalMatrix = new THREE.Matrix4();
	}

	// Static method for PropRenderer to update the list of collidable props
	public static updateDynamicColliders(colliders: THREE.Object3D[]): void {
		CollisionManager.dynamicColliders = colliders;
	}

	public collisionPeriodic(localPlayer: Player) {
		// If no static map BVH and no dynamic colliders, nothing to collide with
		if (!CollisionManager.staticMapBvh && CollisionManager.dynamicColliders.length === 0) {
			return;
		}

		let deltaTime: number = this.clock.getDelta();
		let steps: number = 1;
		// Iterative solving for more stable physics
		while (deltaTime >= 1 / 120) {
			deltaTime = deltaTime / 2;
			steps = steps * 2;
		}
		for (let i = 0; i < steps; i++) {
			this.physics(localPlayer, deltaTime);
		}
	}

	private physics(localPlayer: Player, deltaTime: number) {
		this.prevPosition.copy(localPlayer.position);
		const jump: boolean = this.inputHandler.jump;
		if (this.coyoteTime > 0) this.velocity.add(localPlayer.inputVelocity.clone().multiplyScalar(deltaTime * 8));
		else this.velocity.add(localPlayer.inputVelocity.clone().multiplyScalar(deltaTime * 11));
		this.velocity.y += -20 * deltaTime;
		if (Math.abs(this.velocity.x) < .0000001) this.velocity.x = 0;
		if (Math.abs(this.velocity.z) < .0000001) this.velocity.z = 0;
		localPlayer.position.add(this.velocity.clone().multiplyScalar(deltaTime));

		this.collided = false; // Reset collided status for this physics step

		if (localPlayer.doPhysics) {
			// --- Static Map Collision ---
			const staticBvh = CollisionManager.staticMapBvh;
			if (staticBvh) {
				this.colliderSphere.center.copy(localPlayer.position); // World space sphere

				staticBvh.shapecast({
					intersectsBounds: (box: THREE.Box3) => {
						return box.intersectsSphere(this.colliderSphere);
					},
					intersectsTriangle: (tri: THREE.Triangle) => {
						// Triangles from staticBvh are in world space due to StaticGeometryGenerator
						tri.closestPointToPoint(this.colliderSphere.center, this.deltaVec);
						this.deltaVec.sub(this.colliderSphere.center); // World-space displacement to surface
						const distance: number = this.deltaVec.length();

						if (distance < this.colliderSphere.radius) {
							const depth: number = distance - this.colliderSphere.radius; // Negative depth
							this.deltaVec.normalize(); // Normalized world-space penetration vector

							tri.getNormal(this.triNormal); // World-space normal
							const angle: number = this.triNormal.dot(this.upVector);

							if (angle >= CollisionManager.maxAngle) { // Ground collision
								localPlayer.position.addScaledVector(this.deltaVec, depth);
								this.velocity.y = 0;
								this.coyoteTime = 0;
								this.collided = true;
							} else if (angle <= -.75) { // Ceiling
								localPlayer.position.addScaledVector(this.deltaVec, depth);
								this.velocity.y = 0;
							} else { // Wall
								localPlayer.position.addScaledVector(this.deltaVec, depth);
							}
							// Update colliderSphere center for subsequent checks within this shapecast
							this.colliderSphere.center.copy(localPlayer.position);
						}
						return false; // Continue checking triangles
					},
					boundsTraverseOrder: (box: THREE.Box3) => {
						return box.distanceToPoint(this.colliderSphere.center) - this.colliderSphere.radius;
					},
				});
			}

			// --- Dynamic Prop Collision ---
			for (const propObject of CollisionManager.dynamicColliders) {
				propObject.traverse((meshNode: THREE.Object3D) => {
					if (
						(meshNode as THREE.Mesh).isMesh &&
						(meshNode as THREE.Mesh).geometry &&
						(meshNode as THREE.Mesh).geometry.boundsTree
					) {
						const propMesh = meshNode as THREE.Mesh;
						const propBvh = propMesh.geometry.boundsTree as MeshBVH;

						propMesh.updateWorldMatrix(true, false); // Ensure mesh's world matrix is up-to-date
						this.worldToLocalMatrix.copy(propMesh.matrixWorld).invert();

						// Transform player's current world position to propMesh's local space
						this.tempLocalSphere.center.copy(localPlayer.position).applyMatrix4(this.worldToLocalMatrix);
						// Radius remains the same
						this.tempLocalSphere.radius = this.colliderSphere.radius;

						propBvh.shapecast({
							intersectsBounds: (box: THREE.Box3) => {
								return box.intersectsSphere(this.tempLocalSphere);
							},
							intersectsTriangle: (tri: THREE.Triangle) => {
								// tri is in propMesh's local space
								tri.closestPointToPoint(this.tempLocalSphere.center, this.tempDeltaVec); // tempDeltaVec is local
								this.tempDeltaVec.sub(this.tempLocalSphere.center); // tempDeltaVec is local displacement to surface
								const distance = this.tempDeltaVec.length();

								if (distance < this.tempLocalSphere.radius) {
									const depth = distance - this.tempLocalSphere.radius; // Negative depth
									this.tempDeltaVec.normalize(); // Normalized local penetration vector

									// Transform local penetration vector back to world space for correction
									const worldPenetrationVec = this.tempDeltaVec.clone().transformDirection(propMesh.matrixWorld);

									tri.getNormal(this.tempTriNormal); // Local normal
									// Transform local normal to world space for angle check
									const worldTriNormal = this.tempTriNormal.clone().transformDirection(propMesh.matrixWorld)
										.normalize();

									const angle = worldTriNormal.dot(this.upVector);

									// Prop collisions
									if (angle >= CollisionManager.maxAngle) { // Ground collision
										localPlayer.position.addScaledVector(worldPenetrationVec, depth);
										this.velocity.y = 0;
										this.coyoteTime = 0;
										this.collided = true;
									} else if (angle <= -.75) { // Ceiling
										localPlayer.position.addScaledVector(worldPenetrationVec, depth);
										this.velocity.y = 0;
									} else { // Wall
										localPlayer.position.addScaledVector(worldPenetrationVec, depth);
									}
									// Update player's local position for next triangle check in this shapecast
									this.tempLocalSphere.center.copy(localPlayer.position).applyMatrix4(this.worldToLocalMatrix);
								}
								return false; // Continue checking triangles
							},
							boundsTraverseOrder: (box: THREE.Box3) => {
								return box.distanceToPoint(this.tempLocalSphere.center) - this.tempLocalSphere.radius;
							},
						});
					}
				});
			}
		} // end if (localPlayer.doPhysics)

		// Coyote time, jump, and velocity calculation logic
		if (!this.collided) { // If not collided with map OR any prop
			this.velocity.x *= Math.pow(.95, deltaTime * 120);
			this.velocity.z *= Math.pow(.95, deltaTime * 120);
			this.coyoteTime += deltaTime;
			if (jump && this.coyoteTime < 12 / 120 && !this.jumped) {
				this.velocity.y = 5;
				this.jumped = true;
			}
		} else { // Collided with map OR a prop
			this.velocity.x *= Math.pow(.90, deltaTime * 120);
			this.velocity.z *= Math.pow(.90, deltaTime * 120);
			if (jump) { // Allow jump if on ground (map or prop)
				this.velocity.y = 5;
				// this.jumped = true; // If you want to allow multiple jumps while holding space on ground
			} else {
				this.jumped = false;
			}
		}

		if (!(deltaTime == 0)) {
			localPlayer.velocity.copy(localPlayer.position.clone().sub(this.prevPosition).divideScalar(deltaTime));
		}
	}

	public static staticGeometry(group: THREE.Group) {
		console.time('Building static geometry BVH');
		const staticGenerator = new StaticGeometryGenerator(group);
		staticGenerator.attributes = ['position']; // Only need position for BVH
		const combinedGeom = staticGenerator.generate();

		// Ensure computeBoundsTree is called on the BufferGeometry prototype if not already monkey-patched elsewhere for it
		if (!combinedGeom.computeBoundsTree) {
			combinedGeom.computeBoundsTree = computeBoundsTree;
		}
		combinedGeom.computeBoundsTree({ maxDepth: 1000000, maxLeafTris: 4 });

		CollisionManager.staticMapBvh = combinedGeom.boundsTree; // Store the BVH directly

		// This line seems to be for a visual representation of the collision map, adjust if necessary
		RemotePlayerRenderer.setMap(new THREE.Mesh(combinedGeom));

		this.mapLoaded = true;
		console.timeEnd('Building static geometry BVH');
	}

	public isPlayerInAir(): boolean {
		return !this.collided; // Player is in air if no collision occurred in the last physics step
	}

	public applyVelocity(vector: THREE.Vector3): void {
		this.velocity.add(vector);
	}
}
