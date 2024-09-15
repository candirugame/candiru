import * as THREE from './three.module.js';

const scene = new THREE.Scene();

const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera( 90, window.innerWidth / window.innerHeight, 0.01, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight);
document.body.appendChild( renderer.domElement );

window.addEventListener('resize', onWindowResize, false);

export function doFrame(localPlayer){
    let deltaTime = clock.getDelta();

    renderer.render( scene, camera );

    camera.position.copy(localPlayer.position)
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export function getScene() {
    return scene;
}

export function  getCamera() {
    return camera
}
