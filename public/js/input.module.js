import * as THREE from './three.module.js';
import * as RENDERER from './ren.module.js'
import { PointerLockControls } from './PointerLockControls.js'

let mouse = new PointerLockControls(RENDERER.getCamera(), document.body);

let clock = new THREE.Clock();

const forward = new THREE.Vector3(0, 0, -1);
let direction = new THREE.Vector3;

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

document.addEventListener('click', () => {
    mouse.lock();
});

mouse.addEventListener('lock', () => {
    //console.log('Pointer locked');
});

mouse.addEventListener('unlock', () => {
    //console.log('Pointer unlocked');
});


const keys = {};

export function handleInputs (localPlayer) {
    let deltaTime = clock.getDelta();
    let camera = RENDERER.getCamera();


    let inputX = 0;
    let inputZ = 0;
    let dist = 0;
    let dir = 0;


    if (getKey('w')) inputX -= 1;
    if (getKey('s')) inputX += 1;
    if (getKey('a')) inputZ -= 1;
    if (getKey('d')) inputZ += 1;

    if(getKeyArray(['w','s','a','d']))
        dist = 5; //replace with vel if acceleration is added

    dir = Math.atan2(inputZ,inputX);
    //do this to ensure the magnitude is always 5 regardless of direction
    localPlayer.velocity.z = localPlayer.speed * dist * Math.cos(dir);
    localPlayer.velocity.x = localPlayer.speed * dist * Math.sin(dir);


    camera.getWorldDirection(direction);
    direction.y = 0;
    localPlayer.quaternion.setFromUnitVectors(forward, direction.normalize());

    localPlayer.velocity.applyQuaternion(localPlayer.quaternion);
}

function getKey(key){
    return keys[key] !== undefined && keys[key] !== null && !!keys[key];
}
function getKeyArray(keys){ //returns true if any key in array is pressed
    for(let i = 0; i<keys.length; i++)
        if(getKey(keys[i]))
            return true
    return false;
}

function onKeyDown(event) {
    const key = event.key.toLowerCase();
    keys[key] = true;
}

function onKeyUp(event) {
    const key = event.key.toLowerCase();
    keys[key] = false;
}
