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
import { ParticleSystem } from '../core/ParticleSystem.ts';
import { Networking } from '../core/Networking.ts';
import { Trajectory } from './Trajectory.ts';

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
	private particleSystem?: ParticleSystem; // Optional particle system for effects
	private networking: Networking; // Networking instance for accessing remote players
	private static readonly maxAngle: number = Math.cos(45 * Math.PI / 180);
	private readonly triNormal: THREE.Vector3; // Used for world-space calculations (map) and local for props before conversion
	private readonly upVector: THREE.Vector3;
	private coyoteTime: number;
	private jumped: boolean;
	private collided: boolean;

	// Temporary objects for prop collision calculations to avoid re-allocation
	private readonly tempLocalSphere: THREE.Sphere;
	private readonly tempDeltaVec: THREE.Vector3;
	private readonly tempTriNormal: THREE.Vector3;
	private readonly worldToLocalMatrix: THREE.Matrix4;

	constructor(inputHandler: InputHandler, networking: Networking) {
		this.inputHandler = inputHandler;
		this.networking = networking;
		this.clock = new THREE.Clock();
		this.colliderSphere = new THREE.Sphere(new THREE.Vector3(), .2);
		this.deltaVec = new THREE.Vector3();
		this.prevPosition = new THREE.Vector3();
		this.triNormal = new THREE.Vector3();
		this.upVector = new THREE.Vector3(0, 1, 0);
		this.coyoteTime = 0;
		this.jumped = false;
		this.collided = false;

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

		// if (this.particleSystem) {
		// 	// Emit trajectory previews for all remote players instead of the local player
		// 	const remotes = this.networking.getRemotePlayerData();
		// 	for (const rp of remotes) {
		// 		// if (rp.id === localPlayer.id) continue; // only remote players
		// 		if (!rp.position || !rp.lookQuaternion) continue;
		// 		const pos = new THREE.Vector3(rp.position.x, rp.position.y, rp.position.z);
		// 		const quat = new THREE.Quaternion(
		// 			rp.lookQuaternion.x,
		// 			rp.lookQuaternion.y,
		// 			rp.lookQuaternion.z,
		// 			rp.lookQuaternion.w,
		// 		);
		// 		//this.trajectoryTest(pos, quat);
		// 	}
		// }
	}

	public createTrajectory(
		position: THREE.Vector3,
		quaternion: THREE.Quaternion,
		options?: {
			initialSpeed?: number;
			maxSteps?: number;
			dt?: number;
			gravity?: THREE.Vector3;
			maxBounces?: number;
			elasticity?: number;
		},
	): Trajectory {
		// Defaults
		const gravityVec = options?.gravity?.clone() ?? new THREE.Vector3(0, -30, 0);
		const initialSpeed = options?.initialSpeed ?? 20;
		const maxSteps = options?.maxSteps ?? 100;
		const dt = options?.dt ?? 1 / 24; // one point for every default tick
		const maxBounces = options?.maxBounces ?? 0;
		const elasticity = options?.elasticity ?? 1.0;

		// Initial direction from camera, including pitch
		const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
		const v0 = forward.clone().multiplyScalar(initialSpeed);

		const mapMesh = RemotePlayerRenderer.getMap();
		const raycaster = new THREE.Raycaster();
		raycaster.firstHitOnly = true;

		const points: THREE.Vector3[] = [];
		const hits: { point: THREE.Vector3; normal: THREE.Vector3; index: number }[] = [];

		let currentPos = position.clone();
		const currentVel = v0.clone();
		let currentTime = 0;
		let bounceCount = 0;
		let step = 0;

		for (let i = 0; i < maxSteps; i++) {
			step++;
			currentTime += dt;
			const pos = currentPos.clone()
				.addScaledVector(currentVel, currentTime)
				.addScaledVector(gravityVec, 0.5 * currentTime * currentTime);
			points.push(pos);

			if (mapMesh) {
				const segDir = pos.clone().sub(currentPos);
				const segLen = segDir.length();
				if (segLen > 1e-6) {
					segDir.divideScalar(segLen);
					raycaster.set(currentPos, segDir);
					raycaster.near = 0;
					raycaster.far = segLen;
					const intersections = raycaster.intersectObject(mapMesh, true);
					if (intersections.length > 0) {
						const h = intersections[0];
						const hitPoint = h.point.clone();
						// Derive world-space normal
						let worldNormal = new THREE.Vector3(0, 1, 0);
						if (h.face && h.face.normal) {
							const normalMatrix = new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld);
							worldNormal = h.face.normal.clone().applyMatrix3(normalMatrix).normalize();
						} else {
							type MaybeNormalIntersection = THREE.Intersection & { normal?: THREE.Vector3 };
							const maybe = h as MaybeNormalIntersection;
							if (maybe.normal) {
								worldNormal = maybe.normal.clone().normalize();
							}
						}
						points[points.length - 1] = hitPoint;
						hits.push({ point: hitPoint, normal: worldNormal, index: step });
						if (bounceCount >= maxBounces) {
							break;
						}
						const dot = currentVel.dot(worldNormal);
						const reflected = currentVel.clone().sub(worldNormal.clone().multiplyScalar(2 * dot));
						currentVel.copy(reflected).multiplyScalar(elasticity);
						currentPos = hitPoint;
						currentTime = 0;
						bounceCount++;
					}
				}
			}
		}

		return new Trajectory(points, dt, hits);
	}

	private trajectoryTest(position: THREE.Vector3, quaternion: THREE.Quaternion) {
		const traj = this.createTrajectory(position, quaternion, { maxSteps: 100, maxBounces: 0, elasticity: 0 });

		// Emit trajectory breadcrumbs
		for (const p of traj.points) {
			this.particleSystem?.emit({
				position: p,
				count: 1,
				velocity: new THREE.Vector3(),
				spread: 0,
				lifetime: 0.15,
				size: 0.01,
				color: new THREE.Color(1, 0, 0),
			});
		}

		// If we hit something, draw a small oriented plane at the impact point
		if (traj.hits.length > 0) {
			const lastHit = traj.hits[traj.hits.length - 1];
			const hitPoint = lastHit.point.clone();
			const worldNormal = lastHit.normal.clone();

			const center = hitPoint.clone().addScaledVector(worldNormal, 0.01);
			// Construct orthonormal basis (u, v) spanning the plane
			let u = new THREE.Vector3(0, 1, 0).cross(worldNormal);
			if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0).cross(worldNormal);
			u.normalize();
			const v = worldNormal.clone().cross(u).normalize();

			const halfSize = 0.2; // plane half-extent
			const grid = 6; // grid resolution per side
			for (let gx = 0; gx < grid; gx++) {
				for (let gy = 0; gy < grid; gy++) {
					const fx = (gx / (grid - 1)) * 2 - 1; // [-1, 1]
					const fy = (gy / (grid - 1)) * 2 - 1; // [-1, 1]
					const p = center.clone()
						.addScaledVector(u, fx * halfSize)
						.addScaledVector(v, fy * halfSize);
					this.particleSystem?.emit({
						position: p,
						count: 1,
						velocity: new THREE.Vector3(),
						spread: 0,
						lifetime: 0.35,
						size: 0.012,
						color: new THREE.Color(0, 1, 0),
					});
				}
			}
		}
	}

	private physics(localPlayer: Player, deltaTime: number) {
		this.prevPosition.copy(localPlayer.position);
		const jump: boolean = this.inputHandler.jump;

		if (localPlayer.doPhysics) localPlayer.gravity += deltaTime * -30;
		localPlayer.inputVelocity.y += localPlayer.gravity;
		// Note: This averaging of inputVelocity.y might be specific smoothing; kept as is.
		localPlayer.inputVelocity.y = (localPlayer.inputVelocity.y + this.inputHandler.prevInputVelocity.y) * .25;
		localPlayer.position.add(localPlayer.inputVelocity.clone().multiplyScalar(deltaTime));

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
								localPlayer.inputVelocity.y = 0;
								localPlayer.gravity = 0;
								this.coyoteTime = 0;
								this.collided = true;
							} else { // Wall/ceiling collision
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

									if (angle >= CollisionManager.maxAngle) { // Ground-like collision with prop
										localPlayer.position.addScaledVector(worldPenetrationVec, depth);
										localPlayer.inputVelocity.y = 0;
										localPlayer.gravity = 0;
										this.coyoteTime = 0;
										this.collided = true;
									} else { // Wall/ceiling-like collision with prop
										localPlayer.position.addScaledVector(worldPenetrationVec, depth);
										// Optionally, add sliding logic here for walls
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
			this.coyoteTime += deltaTime;
			if (jump && this.coyoteTime < 6 / 60 && !this.jumped) {
				localPlayer.gravity = 8;
				this.jumped = true;
			}
		} else { // Collided with map OR a prop
			if (jump) { // Allow jump if on ground (map or prop)
				localPlayer.gravity = 8;
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

	public setParticleSystem(particleSystem: ParticleSystem): void {
		this.particleSystem = particleSystem;
	}
}
