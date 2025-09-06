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
	private knockbackTime: number; // seconds of reduced damping after explosive impulse

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
		this.knockbackTime = 0;

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
		//localPlayer.inputVelocity currently represents desired directional speed vector (x,z) after input handling.
		//accelerate the player's actual velocity toward that target using different accel for ground vs air.
		const desired = localPlayer.inputVelocity.clone();
		desired.y = 0;
		const onGround = this.collided; // last frame info
		const maxSpeed = localPlayer.speed;
		const desiredLen = desired.length();
		if (desiredLen > 0) desired.multiplyScalar(1 / desiredLen); // normalize
		//normalize for clean accel blending
		desired.multiplyScalar(Math.min(desiredLen, maxSpeed));

		// Acceleration constants (units per second^2)
		const accelGround = 100;
		const accelAir = 100;
		const accel = onGround ? accelGround : accelAir;

		// Current horizontal velocity vector
		const horizVel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
		// Compute delta toward desired
		const toDesired = desired.clone().sub(horizVel);
		const distToDesired = toDesired.length();
		if (distToDesired > 0) {
			const step = Math.min(distToDesired, accel * deltaTime);
			toDesired.multiplyScalar(step / distToDesired);
			horizVel.add(toDesired);
			this.velocity.x = horizVel.x;
			this.velocity.z = horizVel.z;
		}

		// Apply gravity (magnitude 30)
		this.velocity.y += -25 * deltaTime;

		// Integrate position (single dt)
		localPlayer.position.addScaledVector(this.velocity, deltaTime);

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
		// Post-collision movement adjustments (friction & jumping)
		if (!this.collided) { // Airborne
			this.coyoteTime += deltaTime;
			// Air friction (linear) stronger baseline; reduced during knockback window
			const airFrictionBase = 10; // units/s^2 equivalent slowing
			const airFriction = this.knockbackTime > 0 ? airFrictionBase * 0.35 : airFrictionBase; // suppress ~65% during knockback window
			const hv = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
			const hlen = hv.length();
			if (hlen > 0) {
				const dec = airFriction * deltaTime;
				const newLen = Math.max(0, hlen - dec);
				hv.multiplyScalar(hlen > 0 ? newLen / hlen : 0);
				this.velocity.x = hv.x;
				this.velocity.z = hv.z;
			}
			if (jump && this.coyoteTime < 12 / 120 && !this.jumped) { // restored coyote window 12/120
				this.velocity.y = 5.5; // adjusted jump velocity
				this.jumped = true;
			}
		} else { // Grounded
			this.coyoteTime = 0;
			// Ground friction baseline; reduced during knockback window for initial burst carry
			const groundFrictionBase = 10;
			const groundFriction = this.knockbackTime > 0 ? groundFrictionBase * 0.5 : groundFrictionBase; // 50% friction during knockback window
			const hv = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
			const hlen = hv.length();
			if (hlen > 0) {
				const dec = groundFriction * deltaTime;
				const newLen = Math.max(0, hlen - dec);
				hv.multiplyScalar(hlen > 0 ? newLen / hlen : 0);
				this.velocity.x = hv.x;
				this.velocity.z = hv.z;
			}
			if (jump) {
				this.velocity.y = 5.5;
				// allow immediate jump chaining only on new presses; jumped flag logic below handles hold behavior
			} else {
				this.jumped = false;
			}
		}

		// Decrement knockback window using real time
		if (this.knockbackTime > 0) {
			this.knockbackTime -= deltaTime;
			if (this.knockbackTime < 0) this.knockbackTime = 0;
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

	public triggerKnockback(seconds: number) {
		// Extend current window if new one is longer
		this.knockbackTime = Math.max(this.knockbackTime, seconds);
	}
}
