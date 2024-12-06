import * as THREE from 'three';
import { Player } from '../core/Player.ts';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree, StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';
import { InputHandler } from "./InputHandler.ts";
import { RemotePlayerRenderer} from "../core/RemotePlayerRenderer.ts";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

export class CollisionManager {
    private clock: THREE.Clock;
    private readonly colliderSphere: THREE.Sphere;
    private readonly deltaVec: THREE.Vector3;
    private readonly prevPosition: THREE.Vector3;
    public static mapLoaded: boolean = false;
    private static colliderGeom?: THREE.BufferGeometry; // Mark as possibly undefined
    private inputHandler: InputHandler;
    private static readonly maxAngle: number = Math.cos(45 * Math.PI / 180);
    private readonly triNormal: THREE.Vector3;
    private readonly upVector: THREE.Vector3;
    private coyoteTime: number;
    private jumped: boolean;
    private collided: boolean;

    constructor(inputHandler: InputHandler) {
        this.inputHandler = inputHandler;
        this.clock = new THREE.Clock();
        this.colliderSphere = new THREE.Sphere(new THREE.Vector3(), .2);
        this.deltaVec = new THREE.Vector3();
        this.prevPosition = new THREE.Vector3();
        this.triNormal = new THREE.Vector3();
        this.upVector = new THREE.Vector3(0, 1, 0)
        this.coyoteTime = 0;
        this.jumped = false;
        this.collided = false;
    }

    public collisionPeriodic(localPlayer: Player) {
        if (!CollisionManager.mapLoaded || !CollisionManager.colliderGeom || !CollisionManager.colliderGeom.boundsTree) return; // Add checks
        let deltaTime: number = this.clock.getDelta();
        let steps: number = 1;
        while (deltaTime >= 1 / 120) {
            deltaTime = deltaTime / 2
            steps = steps * 2;
        }
        for (let i = 0; i < steps; i++) {
            this.physics(localPlayer, deltaTime);
        }
    }

    private physics(localPlayer: Player, deltaTime: number) {
        this.prevPosition.copy(localPlayer.position);
        const jump: boolean = this.inputHandler.jump;

        localPlayer.gravity += deltaTime * -30;
        localPlayer.inputVelocity.y += localPlayer.gravity;
        localPlayer.inputVelocity.y = (localPlayer.inputVelocity.y + this.inputHandler.prevInputVelocity.y) * .25;
        localPlayer.position.add(localPlayer.inputVelocity.clone().multiplyScalar(deltaTime));

        const bvh: MeshBVH | undefined = CollisionManager.colliderGeom?.boundsTree;
        if (!bvh) return; // Ensure bvh exists

        this.colliderSphere.center = localPlayer.position.clone();

        this.collided = false;

        bvh.shapecast({
            intersectsBounds: (box: THREE.Box3) => {
                return box.intersectsSphere(this.colliderSphere);
            },

            intersectsTriangle: (tri: THREE.Triangle) => {
                // Get delta between the closest point and center
                tri.closestPointToPoint(this.colliderSphere.center, this.deltaVec);
                this.deltaVec.sub(this.colliderSphere.center);
                const distance: number = this.deltaVec.length();

                if (distance < this.colliderSphere.radius) {
                    // Move the sphere position to be outside the triangle
                    const radius: number = this.colliderSphere.radius;
                    const depth: number = distance - radius;
                    this.deltaVec.multiplyScalar(1 / distance);

                    tri.getNormal(this.triNormal);
                    const angle: number = this.triNormal.dot(this.upVector);

                    if (angle >= CollisionManager.maxAngle) {
                        localPlayer.position.addScaledVector(this.deltaVec, depth);
                        localPlayer.inputVelocity.y = 0;
                        localPlayer.gravity = 0;
                        this.coyoteTime = 0;
                        this.collided = true;
                    } else {
                        localPlayer.position.addScaledVector(this.deltaVec, depth);
                    }
                }

                this.colliderSphere.center = localPlayer.position.clone();
                return false;
            },

            boundsTraverseOrder: (box: THREE.Box3) => {
                return box.distanceToPoint(this.colliderSphere.center) - this.colliderSphere.radius;
            }
        });

        if (!this.collided) {
            this.coyoteTime += deltaTime;
            if (jump && this.coyoteTime < 6 / 60 && !this.jumped) {
                localPlayer.gravity = 8;
                this.jumped = true;
            }
        } else {
            if (jump) {
                localPlayer.gravity = 8;
            } else {
                this.jumped = false;
            }
        }
        if (!(deltaTime == 0)) {
            localPlayer.velocity.copy(localPlayer.position.clone().sub(this.prevPosition).divideScalar(deltaTime));
        }
    }

    public static staticGeometry(group: THREE.Group) {
        if (!this.mapLoaded) {
            console.time("Building static geometry BVH");
            const staticGenerator = new StaticGeometryGenerator(group);
            staticGenerator.attributes = ['position'];
            this.colliderGeom = staticGenerator.generate();
            this.colliderGeom.computeBoundsTree({maxDepth: 1000000, maxLeafTris: 4});
            RemotePlayerRenderer.setMap(new THREE.Mesh(this.colliderGeom));
            this.mapLoaded = true;
            console.timeEnd("Building static geometry BVH");
        }
    }

    public isPlayerInAir(): boolean {
        return !this.collided;
    }
}