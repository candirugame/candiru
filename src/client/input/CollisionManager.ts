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

type DynamicColliderEntry = {
        mesh: THREE.Mesh;
        bvh: MeshBVH;
};

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
        private static dynamicColliderEntries: DynamicColliderEntry[] = []; // Store collidable prop meshes

        private inputHandler: InputHandler;
        private particleSystem?: ParticleSystem; // Optional particle system for effects
        private networking: Networking; // Networking instance for accessing remote players
        private static readonly maxAngle: number = Math.cos(45 * Math.PI / 180);
        private static readonly GRAVITY: number = -30;
        private static readonly JUMP_VELOCITY: number = 8;
        private static readonly COYOTE_TIME: number = 0.1; // seconds
        private readonly triNormal: THREE.Vector3; // Used for world-space calculations (map) and local for props before conversion
        private readonly upVector: THREE.Vector3;
        private coyoteTime: number;
        private jumped: boolean;
        private collided: boolean;
        private readonly frameVelocity: THREE.Vector3;
        private readonly positionDelta: THREE.Vector3;
        private readonly knockbackVelocity: THREE.Vector3;
        private readonly tempImpulse: THREE.Vector3;

        private static readonly KNOCKBACK_AIR_DAMPING = 2.5;
        private static readonly KNOCKBACK_GROUND_DAMPING = 10;

        // Temporary objects for prop collision calculations to avoid re-allocation
        private readonly tempLocalSphere: THREE.Sphere;
        private readonly tempDeltaVec: THREE.Vector3;
        private readonly tempTriNormal: THREE.Vector3;
        private readonly worldToLocalMatrix: THREE.Matrix4;
        private readonly worldPenetrationVec: THREE.Vector3;

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
                this.frameVelocity = new THREE.Vector3();
                this.positionDelta = new THREE.Vector3();
                this.knockbackVelocity = new THREE.Vector3();
                this.tempImpulse = new THREE.Vector3();

                // Initialize temporary objects for prop collisions
                this.tempLocalSphere = new THREE.Sphere(new THREE.Vector3(), this.colliderSphere.radius);
                this.tempDeltaVec = new THREE.Vector3();
                this.tempTriNormal = new THREE.Vector3();
                this.worldToLocalMatrix = new THREE.Matrix4();
                this.worldPenetrationVec = new THREE.Vector3();
        }

        // Static method for PropRenderer to update the list of collidable props
        public static updateDynamicColliders(colliders: THREE.Object3D[]): void {
                const entries: DynamicColliderEntry[] = [];
                for (const collider of colliders) {
                        collider.traverse((node: THREE.Object3D) => {
                                if ((node as THREE.Mesh).isMesh) {
                                        const mesh = node as THREE.Mesh;
                                        const geometry = mesh.geometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
                                        if (geometry?.boundsTree instanceof MeshBVH) {
                                                entries.push({ mesh, bvh: geometry.boundsTree });
                                        }
                                }
                        });
                }

                CollisionManager.dynamicColliderEntries = entries;
        }

        public collisionPeriodic(localPlayer: Player) {
                // If no static map BVH and no dynamic colliders, nothing to collide with
                if (!CollisionManager.staticMapBvh && CollisionManager.dynamicColliderEntries.length === 0) {
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
                const gravityVec = options?.gravity?.clone() ?? new THREE.Vector3(0, CollisionManager.GRAVITY, 0);
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
                let currentVel = v0.clone();
                let bounceCount = 0;

                for (let i = 0; i < maxSteps; i++) {
                        const nextPos = currentPos
                        .clone()
                        .addScaledVector(currentVel, dt)
                        .addScaledVector(gravityVec, 0.5 * dt * dt);
                        const nextVel = currentVel.clone().addScaledVector(gravityVec, dt);

                        if (mapMesh) {
                                const segDir = nextPos.clone().sub(currentPos);
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
                                                points.push(hitPoint);
                                                hits.push({ point: hitPoint, normal: worldNormal, index: i + 1 });
                                                if (bounceCount >= maxBounces) {
                                                        break;
                                                }
                                                const dot = nextVel.dot(worldNormal);
                                                const reflected = nextVel
                                                .clone()
                                                .sub(worldNormal.clone().multiplyScalar(2 * dot))
                                                .multiplyScalar(elasticity);
                                                currentPos = hitPoint;
                                                currentVel = reflected;
                                                bounceCount++;
                                                continue;
                                        }
                                }
                        }

                        points.push(nextPos);
                        currentPos = nextPos;
                        currentVel = nextVel;
                }

                return new Trajectory(points, dt, hits);
        }

        private trajectoryTest(position: THREE.Vector3, quaternion: THREE.Quaternion) {
                if (!this.particleSystem) return;

                const traj = this.createTrajectory(position, quaternion, { maxSteps: 100, maxBounces: 0, elasticity: 0 });

                // Emit trajectory breadcrumbs
                for (const p of traj.points) {
                        this.particleSystem.emit({
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
                                        this.particleSystem.emit({
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

                if (!localPlayer.doPhysics) {
                        this.coyoteTime = 0;
                        this.jumped = false;
                        localPlayer.gravity = 0;
                } else {
                        localPlayer.gravity += CollisionManager.GRAVITY * deltaTime;
                }

                this.frameVelocity.set(
                localPlayer.inputVelocity.x,
                localPlayer.gravity,
                localPlayer.inputVelocity.z,
                );
                this.frameVelocity.x += this.knockbackVelocity.x;
                this.frameVelocity.y += this.knockbackVelocity.y;
                this.frameVelocity.z += this.knockbackVelocity.z;
                localPlayer.inputVelocity.y = localPlayer.gravity;
                localPlayer.position.addScaledVector(this.frameVelocity, deltaTime);

                this.collided = false; // Reset collided status for this physics step

                if (localPlayer.doPhysics) {
                        // --- Static Map Collision ---
                        const staticBvh = CollisionManager.staticMapBvh;
                        if (staticBvh) {
                                this.colliderSphere.center.copy(localPlayer.position); // World space sphere

                                staticBvh.shapecast({
                                        intersectsBounds: (box: THREE.Box3) => box.intersectsSphere(this.colliderSphere),
                                        intersectsTriangle: (tri: THREE.Triangle) => {
                                                // Triangles from staticBvh are in world space due to StaticGeometryGenerator
                                                tri.closestPointToPoint(this.colliderSphere.center, this.deltaVec);
                                                this.deltaVec.sub(this.colliderSphere.center); // World-space displacement to surface
                                                const distance: number = this.deltaVec.length();

                                                if (distance < this.colliderSphere.radius) {
                                                        const penetration: number = this.colliderSphere.radius - distance;
                                                        if (this.deltaVec.lengthSq() > 0) {
                                                                this.deltaVec.normalize();
                                                        } else {
                                                                this.deltaVec.set(0, 1, 0);
                                                        }

                                                        tri.getNormal(this.triNormal); // World-space normal
                                                        const angle: number = this.triNormal.dot(this.upVector);

                                                        localPlayer.position.addScaledVector(this.deltaVec, -penetration);
                                                        this.removeKnockbackIntoSurface(this.deltaVec);

                                                        if (angle >= CollisionManager.maxAngle) { // Ground collision
                                                                localPlayer.inputVelocity.y = 0;
                                                                localPlayer.gravity = 0;
                                                                this.coyoteTime = 0;
                                                                this.collided = true;
                                                                this.knockbackVelocity.y = 0;
                                                        }

                                                        // Update colliderSphere center for subsequent checks within this shapecast
                                                        this.colliderSphere.center.copy(localPlayer.position);
                                                }
                                                return false; // Continue checking triangles
                                        },
                                        boundsTraverseOrder: (box: THREE.Box3) =>
                                        box.distanceToPoint(this.colliderSphere.center) - this.colliderSphere.radius,
                                });
                        }

                        // --- Dynamic Prop Collision ---
                        for (const { mesh, bvh } of CollisionManager.dynamicColliderEntries) {
                                mesh.updateWorldMatrix(true, false); // Ensure mesh's world matrix is up-to-date
                                this.worldToLocalMatrix.copy(mesh.matrixWorld).invert();

                                // Transform player's current world position to mesh's local space
                                this.tempLocalSphere.center.copy(localPlayer.position).applyMatrix4(this.worldToLocalMatrix);
                                this.tempLocalSphere.radius = this.colliderSphere.radius;

                                bvh.shapecast({
                                        intersectsBounds: (box: THREE.Box3) => box.intersectsSphere(this.tempLocalSphere),
                                        intersectsTriangle: (tri: THREE.Triangle) => {
                                                tri.closestPointToPoint(this.tempLocalSphere.center, this.tempDeltaVec);
                                                this.tempDeltaVec.sub(this.tempLocalSphere.center);
                                                const distance = this.tempDeltaVec.length();

                                                if (distance < this.tempLocalSphere.radius) {
                                                        const penetration = this.tempLocalSphere.radius - distance;
                                                        if (this.tempDeltaVec.lengthSq() > 0) {
                                                                this.tempDeltaVec.normalize();
                                                        } else {
                                                                this.tempDeltaVec.set(0, 1, 0);
                                                        }

                                                        this.worldPenetrationVec.copy(this.tempDeltaVec).transformDirection(mesh.matrixWorld);

                                                        tri.getNormal(this.tempTriNormal);
                                                        this.tempTriNormal.transformDirection(mesh.matrixWorld).normalize();

                                                        localPlayer.position.addScaledVector(this.worldPenetrationVec, -penetration);
                                                        this.removeKnockbackIntoSurface(this.worldPenetrationVec);

                                                        if (this.tempTriNormal.dot(this.upVector) >= CollisionManager.maxAngle) {
                                                                localPlayer.inputVelocity.y = 0;
                                                                localPlayer.gravity = 0;
                                                                this.coyoteTime = 0;
                                                                this.collided = true;
                                                                this.knockbackVelocity.y = 0;
                                                        }

                                                        this.tempLocalSphere.center
                                                        .copy(localPlayer.position)
                                                        .applyMatrix4(this.worldToLocalMatrix);
                                                }
                                                return false; // Continue checking triangles
                                        },
                                        boundsTraverseOrder: (box: THREE.Box3) =>
                                        box.distanceToPoint(this.tempLocalSphere.center) - this.tempLocalSphere.radius,
                                });
                        }
                } // end if (localPlayer.doPhysics)

                // Coyote time, jump, and velocity calculation logic
                if (this.collided) {
                        this.coyoteTime = 0;
                        if (jump && !this.jumped) {
                                localPlayer.gravity = CollisionManager.JUMP_VELOCITY;
                                localPlayer.inputVelocity.y = localPlayer.gravity;
                                this.jumped = true;
                                this.collided = false;
                        }
                } else {
                        this.coyoteTime += deltaTime;
                        if (jump && this.coyoteTime <= CollisionManager.COYOTE_TIME && !this.jumped) {
                                localPlayer.gravity = CollisionManager.JUMP_VELOCITY;
                                localPlayer.inputVelocity.y = localPlayer.gravity;
                                this.jumped = true;
                        }
                }

                if (!jump) {
                        this.jumped = false;
                }

                const damping = Math.exp(-deltaTime * (this.collided
                        ? CollisionManager.KNOCKBACK_GROUND_DAMPING
                        : CollisionManager.KNOCKBACK_AIR_DAMPING));
                this.knockbackVelocity.multiplyScalar(damping);
                if (this.knockbackVelocity.lengthSq() < 1e-6) {
                        this.knockbackVelocity.set(0, 0, 0);
                }

                if (deltaTime !== 0) {
                        this.positionDelta.copy(localPlayer.position).sub(this.prevPosition).divideScalar(deltaTime);
                        localPlayer.velocity.copy(this.positionDelta);
                }
        }

        private removeKnockbackIntoSurface(surfaceNormal: THREE.Vector3) {
                const normal = this.tempImpulse.copy(surfaceNormal);
                if (normal.lengthSq() === 0) return;
                normal.normalize();
                const intoSurface = this.knockbackVelocity.dot(normal);
                if (intoSurface > 0) {
                        this.knockbackVelocity.addScaledVector(normal, -intoSurface);
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

                CollisionManager.mapLoaded = true;
                console.timeEnd('Building static geometry BVH');
        }

        public isPlayerInAir(): boolean {
                return !this.collided; // Player is in air if no collision occurred in the last physics step
        }

        public setParticleSystem(particleSystem: ParticleSystem): void {
                this.particleSystem = particleSystem;
        }

        public applyExternalImpulse(localPlayer: Player, impulse: THREE.Vector3): void {
                const horizontalImpulse = this.tempImpulse.copy(impulse);
                horizontalImpulse.y = 0;
                this.knockbackVelocity.add(horizontalImpulse);
                localPlayer.gravity += impulse.y;
                localPlayer.inputVelocity.y = localPlayer.gravity;
        }
}
