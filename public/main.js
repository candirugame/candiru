import * as RENDERER from '/js/ren.module.js';
import * as INPUTS from '/js/input.module.js';
import * as NW from '/js/networking.module.js'
import * as THREE from './js/three.module.js';
import * as COLLISION from './js/collision.module.js'



let localPlayer = {
    position : new THREE.Vector3(),
    velocity : new THREE.Vector3(),
    quaternion : new THREE.Quaternion()
};

function init() {
    COLLISION.collisionInit();
}

function animate() {
    INPUTS.handleInputs(localPlayer);
    requestAnimationFrame(animate)
    COLLISION.collisionPeriodic(localPlayer)
    RENDERER.doFrame(localPlayer);

}

init();
animate();