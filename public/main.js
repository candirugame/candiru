import * as RENDERER from '/js/ren.module.js';
import * as INPUTS from '/js/input.module.js';
import * as NETWORKING from '/js/networking.module.js'
import * as THREE from './js/three.module.js';
import * as COLLISION from './js/collision.module.js'



let localPlayer = {
    position : new THREE.Vector3(),
    velocity : new THREE.Vector3(),
    quaternion : new THREE.Quaternion(),
    id : Math.floor(Math.random() * 10000),
    gameVersion : '',
    name: ''
};

function init() {
    COLLISION.collisionInit();
}
let remotePlayerData = [];

function animate() {
    INPUTS.handleInputs(localPlayer);
    NETWORKING.updatePlayerData(localPlayer);
    remotePlayerData = NETWORKING.getRemotePlayerData();
    COLLISION.collisionPeriodic(localPlayer)
    RENDERER.doFrame(localPlayer);

    requestAnimationFrame(animate)
}

init();
animate();