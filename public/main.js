import * as RENDERER from '/js/ren.module.js';
import * as INPUTS from '/js/input.module.js';
import * as NETWORKING from '/js/networking.module.js'
import * as THREE from './js/three.module.js';


let localPlayer = {
    position : new THREE.Vector3(),
    velocity : new THREE.Vector3(),
    quaternion : new THREE.Quaternion(),
    id : Math.floor(Math.random() * 10000),
    gameVersion : 'unknown',
    name: ''
};

console.log('localPlayer',localPlayer);

let remotePlayers = [];

function animate() {
    INPUTS.handleInputs(localPlayer);
    RENDERER.doFrame();
    NETWORKING.updatePlayerData(localPlayer)

    requestAnimationFrame(animate)
}

animate();