import * as THREE from './three.module.js';
import * as RENDERER from './ren.module.js'
import { PointerLockControls } from './PointerLockControls.js'

let mouse = new PointerLockControls(RENDERER.getCamera(), document.body);

let clock = new THREE.Clock();

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

document.addEventListener('click', () => {
    mouse.lock();
});

mouse.addEventListener('lock', () => {
    console.log('Pointer locked');
});

mouse.addEventListener('unlock', () => {
    console.log('Pointer unlocked');
});

const localPlayerSpeed = 5;

const keys = { w: false, a: false, s: false, d: false };

export function handleInputs (localPlayer) {
     let deltaTime = clock.getDelta();
     let movementDistance = localPlayerSpeed ;

     if (keys.w) localPlayer.velocity.z -= movementDistance;
     if (keys.s) localPlayer.velocity.z += movementDistance;
     if (keys.a) localPlayer.velocity.x -= movementDistance;
     if (keys.d) localPlayer.velocity.x += movementDistance;
}

function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = true;
}

function onKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = false;
}
