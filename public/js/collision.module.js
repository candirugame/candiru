import * as THREE from './three.module.js'
import * as RENDERER from './ren.module.js'

const clock = new THREE.Clock();

const raycaster = new THREE.Raycaster();
const playerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 32));

const cube = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), new THREE.MeshBasicMaterial( { color: 0x0000ff } ));
const wall1 = new THREE.Mesh( new THREE.BoxGeometry( 1, 5, 5), new THREE.MeshBasicMaterial( { color: 0xff0000 } ))

export function collisionPeriodic(localPlayer) {
    const deltaTime = clock.getDelta();
    const scene = RENDERER.getScene();

    cube.rotation.x += 2 * deltaTime ;
    cube.rotation.y += 2 * deltaTime;

    let direction = new THREE.Vector3()
    direction.copy(localPlayer.velocity)
    direction.normalize()
    raycaster.set(localPlayer.position, direction);

    const intersects = raycaster.intersectObject(scene, true);
    if(intersects.length > 0) {
        const distance = intersects[0].distance;
        if (distance < .5) {
            const wallNormal = new THREE.Vector3();
            wallNormal.copy(intersects[0].face.normal);

            localPlayer.velocity = localPlayer.velocity.projectOnPlane(wallNormal);
        }
    }

    localPlayer.position.add(localPlayer.velocity.multiplyScalar(deltaTime));
}

export function collisionInit() {
    const scene = RENDERER.getScene();

    wall1.position.set(5, 2.5, 5);
    scene.add( wall1 );
    scene.add( cube );

}