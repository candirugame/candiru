import * as THREE from 'three';
import { io } from 'socket.io-client';
import {getLocalPlayerData} from "./main.js";
const socket = io();
async function fetchVersion(){
    try{
        const response = await fetch("gameVersion.json")
        return await response.json();
    }catch(e){console.error(e)}
}

let gameVersion = '';
fetchVersion().then(r => gameVersion = (r['version']));

let remotePlayers = [];
let lastUploadedLocalPlayer = null;

let lastUploadTime = 0;
const uploadWait = 1/15; // 1/10 is 10 updates per second

export function updatePlayerData(localPlayer){
    let currentTime = Date.now()/1000;
    localPlayer.gameVersion = gameVersion;
    if(currentTime - lastUploadTime < uploadWait)
        return;

    if(localPlayer.gameVersion === '')
        return;

    if(playersAreEqualEnough(localPlayer, lastUploadedLocalPlayer) && Date.now()/1000 - lastUploadTime < 5)
        return;

    socket.emit('playerData', localPlayer);
    lastUploadedLocalPlayer = {
        position: localPlayer.position.clone(),
        quaternion: localPlayer.quaternion.clone(),
    };
    console.log('uploading!!')

    lastUploadTime = currentTime;

}

socket.on('remotePlayerData',(data) => {
    remotePlayers = data;
});


function playersAreEqualEnough(player1, player2){
    if(player1 === null || player2 === null)
        return false;
    let out=true;
    out = out && player1.position.equals(player2.position);
    out = out && player1.quaternion.equals(player2.quaternion);

    return out;
}

export function getRemotePlayerData(){
    return remotePlayers;
}

export function updateUserMessage(msg){
    let userMessage = {
        text: msg,
        playerId: getLocalPlayerData().id,
        name: getLocalPlayerData().name,
    }
socket.emit('updateUserMessage',msg);
}
