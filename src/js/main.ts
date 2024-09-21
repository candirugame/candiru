import * as RENDERER from './ren.module.ts';
import * as CHAT from './chat.module.ts'
import * as INPUTS from './input.module.ts';
import * as NETWORKING from './networking.module.ts'
import * as THREE from 'three';
import * as COLLISION from './collision.module.ts'



let localPlayer = {
    position : new THREE.Vector3(6,0.1016,12),
    velocity : new THREE.Vector3(),
    quaternion : new THREE.Quaternion(),
    id : Math.floor(Math.random() * 10000),
    gameVersion : '',
    name: '',
    speed: 1,
    chatActive: false,
    chatMsg: '',
    latency: 1000,
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
    CHAT.onFrame()

    RENDERER.doFrame(localPlayer);



    requestAnimationFrame(animate)
}

export function getLocalPlayerData(){
return localPlayer;
}

init();
animate();

if(localPlayer.name === ''){
    if(localStorage.getItem('name')!=null)
        localPlayer.name = localStorage.getItem('name');
}