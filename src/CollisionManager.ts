import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Player } from './Player';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

export class CollisionManager {
    private clock: THREE.Clock;
    private raycaster: THREE.Raycaster;
    private scene: THREE.Scene;
    private gravity: number;
    private physicsTickRate: number;
    private physicsTickTimer: number;
    public static mapLoaded: boolean = false;

    constructor(renderer: Renderer, physicsTickRate: number) {
        this.scene = renderer.getScene();
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        if (physicsTickRate) {
            this.physicsTickRate = physicsTickRate;
        } else {
            this.physicsTickRate = 1/60;
        }
        this.physicsTickTimer = 0;
    }

    public init() {
        this.gravity = 0;
    }

    public collisionPeriodic(localPlayer: Player) {
        if(!CollisionManager.mapLoaded) {return;}
        const deltaTime: number = this.clock.getDelta();
        // console.log(localPlayer.position);
        this.physics(localPlayer, deltaTime);
    }

    private physics(localPlayer: Player, deltaTime: number) {
        this.physicsTickTimer += deltaTime;
        while(this.physicsTickTimer >= this.physicsTickRate) {
            let onGround: boolean = false;

            const direction = new THREE.Vector3();
            localPlayer.velocity.y = 0;
            direction.copy(localPlayer.velocity);
            direction.normalize();

            this.raycaster.set(localPlayer.position, new THREE.Vector3(0, -1, 0));

            const down_intersects = this.raycaster.intersectObjects(this.scene.children, true);

            if (down_intersects.length > 0) {
                for (const intersect of down_intersects) {
                    if (intersect.distance < 0.201) {
                        const slopeAngle = Math.acos(intersect.face.normal.dot(new THREE.Vector3(0, 1, 0)));
                        if (!(slopeAngle < Math.PI / 4 && slopeAngle != 0)) {
                            localPlayer.position.y = intersect.point.y + 0.2;
                        }

                        onGround = true;
                        this.gravity = 0;
                    }
                }
            }
            this.raycaster.set(localPlayer.position, direction);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);

            if (intersects.length > 0) {
                for (const intersect of intersects) {
                    if (intersect.distance < 0.2) {
                        const normal = intersect.face.normal;
                        const slopeAngle = Math.acos(intersect.face.normal.dot(new THREE.Vector3(0, 1, 0)));
                        if (!(slopeAngle < Math.PI / 4)) {
                            normal.y = 0;
                        }
                        localPlayer.velocity = localPlayer.velocity.projectOnPlane(normal);
                    }
                }
            }

            if(!onGround) {
                this.gravity += -9.8 * deltaTime;
                localPlayer.position.add(new THREE.Vector3(0, this.gravity, 0).multiplyScalar(this.physicsTickRate));
            }

            localPlayer.position.add(localPlayer.velocity.clone().multiplyScalar(this.physicsTickRate));
            this.physicsTickTimer -= this.physicsTickRate;
        }
    }
}