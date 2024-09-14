import * as THREE from './three.module.js';

let clock = new THREE.Clock();

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

const localPlayerSpeed = 5;

const keys = { w: false, a: false, s: false, d: false };

export function handleInputs (localPlayer) {
     let deltaTime = clock.getDelta();
     let movementDistance = localPlayerSpeed * deltaTime;

     if (keys.w) localPlayer.object3d.position.z -= movementDistance;
     if (keys.s) localPlayer.object3d.position.z += movementDistance;
     if (keys.a) localPlayer.object3d.position.x -= movementDistance;
     if (keys.d) localPlayer.object3d.position.x += movementDistance;

     localPlayer.height
}

function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = true;
}

function onKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = false;
}
