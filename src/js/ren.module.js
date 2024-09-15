import * as THREE from 'three';
import * as NETWORKING  from './networking.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();

const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera( 90, window.innerWidth / window.innerHeight, 0.01, 1000 );

const renderer = new THREE.WebGLRenderer();
document.body.appendChild( renderer.domElement );
renderer.domElement.style.imageRendering = 'pixelated';
renderer.setAnimationLoop(null);

onWindowResize();

window.addEventListener('resize', onWindowResize, false);

export function doFrame(localPlayer){
    let deltaTime = clock.getDelta();

    renderer.render( scene, camera );

    camera.position.copy(localPlayer.position)

    scene.fog = new THREE.FogExp2('#111111',0.1)

}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(200/window.innerHeight);
}

export function getScene() {
    return scene;
}

export function  getCamera() {
    return camera
}
