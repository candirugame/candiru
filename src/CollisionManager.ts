import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Player } from './Player';

export class CollisionManager {
    private clock: THREE.Clock;
    private raycaster: THREE.Raycaster;
    private cube: THREE.Mesh;
    private wall1: THREE.Mesh;
    private wall2: THREE.Mesh;
    private renderer: Renderer;

    constructor(renderer: Renderer) {
        this.renderer = renderer;
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();

        this.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
        this.wall1 = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 5), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        this.wall2 = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    }

    public init() {
        const scene = this.renderer.getScene();

        this.wall1.position.set(5, 2.5, 5);
        this.wall2.position.set(7.5, 2.5, 5);
        this.cube.position.set(0, 2, -4);
        scene.add(this.cube);
        scene.add(this.wall1);
        scene.add(this.wall2);
    }

    public collisionPeriodic(localPlayer: Player) {
        const deltaTime = this.clock.getDelta();

        const scene = this.renderer.getScene();

        this.cube.rotation.x += 2 * deltaTime;
        this.cube.rotation.y += 2 * deltaTime;

        const direction = new THREE.Vector3();
        direction.copy(localPlayer.velocity);
        direction.normalize();
        this.raycaster.set(localPlayer.position, direction);

        const intersects = this.raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            for (const intersect of intersects) {
                const distance = intersect.distance;
                if (distance < 0.5) {
                    const wallNormal = intersect.face.normal.clone();

                    localPlayer.velocity = localPlayer.velocity.projectOnPlane(wallNormal);
                }
            }
        }

        localPlayer.position.add(localPlayer.velocity.clone().multiplyScalar(deltaTime));
    }
}