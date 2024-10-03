import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Player } from './Player';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import {Vector3} from "three";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

export class CollisionManager {
    private clock: THREE.Clock;
    private raycaster: THREE.Raycaster;
    private scene: THREE.Scene;

    constructor(renderer: Renderer) {
        this.scene = renderer.getScene();
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
    }

    public init() {
        // const geometry = new THREE.TorusGeometry;
        // const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        // const cube = new THREE.Mesh(geometry, material);
        // cube.position.x = 5;
        // cube.geometry.computeBoundsTree();
        // this.scene.add(cube);
    }

    public collisionPeriodic(localPlayer: Player) {
        const deltaTime: number = this.clock.getDelta();
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
                    localPlayer.position.y = intersect.point.y + 0.2;

                    onGround = true;
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
            localPlayer.position.add(new THREE.Vector3(0, -4, 0).multiplyScalar(deltaTime));
        }

        localPlayer.position.add(localPlayer.velocity.clone().multiplyScalar(deltaTime * localPlayer.speed));
        // console.log(localPlayer.position);
    }
}