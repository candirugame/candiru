import * as THREE from 'three';
import * as RENDERER from './ren.module.ts';
import { PointerLockControls } from './PointerLockControls.ts';
import * as MAIN from '../main.ts';

const mouse = new PointerLockControls(RENDERER.getCamera(), document.body);
const forward = new THREE.Vector3(0, 0, -1);
const direction = new THREE.Vector3();

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mouseup', onMouseUp);
document.addEventListener('mouseleave', onMouseUp);
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
let leftMouseDown = false;
let rightMouseDown = false;

export function handleInputs(localPlayer) {
    const camera = RENDERER.getCamera();
    if (MAIN.getLocalPlayerData().chatActive) return;

    let inputX = 0;
    let inputZ = 0;
    let dist = 0;
    let dir = 0;

    if (getKey('w')) inputX -= 1;
    if (getKey('s')) inputX += 1;
    if (getKey('a')) inputZ -= 1;
    if (getKey('d')) inputZ += 1;

    if (inputX !== 0 || inputZ !== 0) dist = 5; // replace with vel if acceleration is added
    dir = Math.atan2(inputZ, inputX);

    // Ensure the magnitude is always 5 regardless of direction
    localPlayer.velocity.z = localPlayer.speed * dist * Math.cos(dir);
    localPlayer.velocity.x = localPlayer.speed * dist * Math.sin(dir);

    camera.getWorldDirection(direction);
    direction.y = 0;
    localPlayer.quaternion.setFromUnitVectors(forward, direction.normalize());
    localPlayer.velocity.applyQuaternion(localPlayer.quaternion);
}

function getKey(key) {
    return keys[key] !== undefined && keys[key] !== null && !!keys[key];
}

function onKeyDown(event) {
    const key = event.key.toLowerCase();
    keys[key] = true;
}

function onKeyUp(event) {
    const key = event.key.toLowerCase();
    keys[key] = false;
}

export function getLeftMouseDown() {
    return leftMouseDown;
}

export function getRightMouseDown() {
    return rightMouseDown;
}

function onMouseDown(event) {
    if (event.button === 0) {
        leftMouseDown = true;
    } else if (event.button === 2) {
        rightMouseDown = true;
    }
}

function onMouseUp(event) {
    if (event.button === 0) {
        leftMouseDown = false;
    } else if (event.button === 2) {
        rightMouseDown = false;
    }
}

// Prevent context menu from appearing on right click
document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});