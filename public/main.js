import * as THREE from './js/three.module.js';

const socket = io();

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera( 90, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight);
document.body.appendChild( renderer.domElement );

const geometry = new THREE.BoxGeometry( 1, 1, 1 );
const material = new THREE.MeshBasicMaterial( { color: 0x0000ff } );
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

camera.position.z = 5;

const keys = { w: false, a: false, s: false, d: false };

const SPEED = 5;

let lastTime = 0;

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);


function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = true;
}

function onKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = false;
}

function animate(currentTime) {
    requestAnimationFrame(animate)

    const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    console.log(deltaTime)
    lastTime = currentTime;

    let movementDistance = SPEED * deltaTime;

    if (keys.w) camera.position.z -= movementDistance;
    if (keys.s) camera.position.z += movementDistance;
    if (keys.a) camera.position.x -= movementDistance;
    if (keys.d) camera.position.x += movementDistance;

    cube.rotation.x += .01 * deltaTime;
    cube.rotation.y += .01 * deltaTime;

    renderer.render( scene, camera );

}

animate();