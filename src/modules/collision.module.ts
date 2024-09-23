import * as THREE from 'three';
import * as RENDERER from './ren.module.ts';

const clock = new THREE.Clock();

const raycaster = new THREE.Raycaster();

const cube = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), new THREE.MeshBasicMaterial( { color: 0x0000ff } ));
const wall1 = new THREE.Mesh( new THREE.BoxGeometry( 1, 5, 5), new THREE.MeshBasicMaterial( { color: 0xff0000 } ));
const wall2 = new THREE.Mesh( new THREE.BoxGeometry( 5, 5, 1), new THREE.MeshBasicMaterial( { color: 0xff0000 } ));

export function collisionPeriodic(localPlayer) {
    const deltaTime = clock.getDelta();
    const scene = RENDERER.getScene();

    cube.rotation.x += 2 * deltaTime ;
    cube.rotation.y += 2 * deltaTime;

    const direction = new THREE.Vector3();
    direction.copy(localPlayer.velocity);
    direction.normalize();
    raycaster.set(localPlayer.position, direction);

    const intersects = raycaster.intersectObject(scene, true);
    if(intersects.length > 0) {
        for (let i = 0; i < intersects.length; i++) {
            const distance = intersects[i].distance;
            if (distance < .5) {
                const wallNormal = new THREE.Vector3();
                wallNormal.copy(intersects[i].face.normal);

                localPlayer.velocity = localPlayer.velocity.projectOnPlane(wallNormal);
            }
        }
    }

    localPlayer.position.add(localPlayer.velocity.multiplyScalar(deltaTime));
}

export function collisionInit() {
    const scene = RENDERER.getScene();

    wall1.position.set(5, 2.5, 5);
    wall2.position.set(7.5, 2.5, 5);
    cube.position.set(0,2,-4);
    scene.add(cube);
    scene.add( wall1 );
    scene.add( wall2 );

}