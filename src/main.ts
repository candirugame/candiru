import * as RENDERER from './modules/ren.module.ts';
import * as CHAT from './modules/chat.module.ts'
import * as INPUTS from './modules/input.module.ts';
import * as NETWORKING from './modules/networking.module.ts'
import * as THREE from 'three';
import * as COLLISION from './modules/collision.module.ts'
import * as INVENTORY from './modules/inventory.module.ts'



const localPlayer = {
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


// eslint-disable-next-line @typescript-eslint/no-unused-vars
let remotePlayerData = [];

function init() {
    COLLISION.collisionInit();
    INVENTORY.init();
}


function animate() {
    INPUTS.handleInputs(localPlayer);
    NETWORKING.updatePlayerData(localPlayer);
    remotePlayerData = NETWORKING.getRemotePlayerData();
    COLLISION.collisionPeriodic(localPlayer)
    CHAT.onFrame()
    INVENTORY.onFrame()

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