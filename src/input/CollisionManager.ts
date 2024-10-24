import * as THREE from 'three';
import { Renderer } from '../core/Renderer.ts';
import { Player } from '../core/Player.ts';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree, StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';
import { Group, Vector3 } from "three";
import { InputHandler } from "./InputHandler.ts";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

export class CollisionManager {
    private clock: THREE.Clock;
    private colliderSphere: THREE.Sphere;
    private deltaVec: THREE.Vector3;
    private raycaster: THREE.Raycaster;
    private scene: THREE.Scene;
    public mapLoaded: boolean = false;
    private staticGenerator?: StaticGeometryGenerator; // Mark as possibly undefined
    private colliderGeom?: THREE.BufferGeometry; // Mark as possibly undefined
    private inputHandler: InputHandler;
    private static maxAngle: number = Math.cos(45 * Math.PI / 180);
    private triNormal: Vector3;
    private coyoteTime: number;
    private jumped: boolean;

    constructor(renderer: Renderer, inputHandler: InputHandler) {
        this.scene = renderer.getScene();
        this.inputHandler = inputHandler;
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.colliderSphere = new THREE.Sphere(new Vector3(), .2);
        this.deltaVec = new THREE.Vector3();
        this.triNormal = new THREE.Vector3();
        this.coyoteTime = 0;
        this.jumped = false;
    }

    public init() {
        // Initialization logic if any
    }

    public collisionPeriodic(localPlayer: Player) {
        if (!this.mapLoaded || !this.colliderGeom || !this.colliderGeom.boundsTree) return; // Add checks
        let deltaTime: number = this.clock.getDelta();
        let steps: number = 1;
        while (deltaTime >= 1/120) {
            deltaTime = deltaTime / 2
            steps = steps * 2;
        }
        for (let i = 0; i < steps; i ++) {
            this.physics(localPlayer, deltaTime);
        }
    }

    private physics(localPlayer: Player, deltaTime: number) {
        const jump: boolean = this.inputHandler.jump;

        localPlayer.gravity += deltaTime * -30;
        localPlayer.velocity.y += localPlayer.gravity;
        localPlayer.velocity.y = (localPlayer.velocity.y + this.inputHandler.prevVelocity.y) * .25;
        localPlayer.position.add(localPlayer.velocity.clone().multiplyScalar(deltaTime));

        const bvh: MeshBVH | undefined = this.colliderGeom?.boundsTree;
        if (!bvh) return; // Ensure bvh exists

        this.colliderSphere.center = localPlayer.position.clone();

        let collided: boolean = false;

        bvh.shapecast({
            intersectsBounds: (box: THREE.Box3) => {
                return box.intersectsSphere(this.colliderSphere);
            },

            intersectsTriangle: (tri: THREE.Triangle) => {
                tri.getNormal(this.triNormal);

                const angle: number = this.triNormal.dot(new THREE.Vector3(0, 1, 0));

                // Get delta between the closest point and center
                tri.closestPointToPoint(this.colliderSphere.center, this.deltaVec);
                this.deltaVec.sub(this.colliderSphere.center);
                const distance: number = this.deltaVec.length();

                if (distance < this.colliderSphere.radius) {
                    // Move the sphere position to be outside the triangle
                    const radius: number = this.colliderSphere.radius;
                    const depth: number = distance - radius;
                    this.deltaVec.multiplyScalar(1 / distance);

                    if (angle >= CollisionManager.maxAngle) {
                        localPlayer.position.addScaledVector(this.deltaVec, depth);
                        localPlayer.velocity.y = 0;
                        localPlayer.gravity = 0;
                        this.coyoteTime = 0;
                        collided = true;
                    } else {
                        localPlayer.position.addScaledVector(this.deltaVec, depth);
                    }
                }
            },

            boundsTraverseOrder: (box: THREE.Box3) => {
                return box.distanceToPoint(this.colliderSphere.center) - this.colliderSphere.radius;
            }
        });

        if (!collided) {
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
    }

    public staticGeometry(group: Group) {
        console.time("Building static geometry BVH");
        this.staticGenerator = new StaticGeometryGenerator(group);
        this.staticGenerator.attributes = ['position'];
        this.colliderGeom = this.staticGenerator.generate();
        this.colliderGeom.computeBoundsTree();
        this.mapLoaded = true;
        console.timeEnd("Building static geometry BVH");
    }
}
