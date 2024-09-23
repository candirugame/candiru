import {io} from 'socket.io-client';
import {getLocalPlayerData} from "../main.ts";
import * as CHAT from './chat.module.ts';

const socket = io();
async function fetchVersion(){
    try{
        const response = await fetch("gameVersion.json");
        return await response.json();
    }catch(e){console.error(e);}
}

let gameVersion = '';
fetchVersion().then(r => gameVersion = (r['version']));

let remotePlayers = [];
let lastUploadedLocalPlayer = null;

let lastUploadTime = 0;
const uploadWait = 1/15; // 1/10 is 10 updates per second
let lastLatencyTestEmit = 0;
const latencyTestWait = 5;


export function updatePlayerData(localPlayer){
    const currentTime = Date.now()/1000;
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

    lastUploadTime = currentTime;

    if(Date.now()/1000 - lastLatencyTestEmit > latencyTestWait){
        socket.emit('latencyTest');
        lastLatencyTestEmit = Date.now()/1000;
    }
}

socket.on('latencyTest',()=>{
    getLocalPlayerData().latency = (Date.now() / 1000 - lastLatencyTestEmit) * 1000;
});

socket.on('remotePlayerData',(data) => {
    remotePlayers = data;
    processRemoteData();
});

socket.on('chatMsg', (data) => {
    if(data.id !== getLocalPlayerData().id)
        CHAT.addChatMessage(data);
});

function processRemoteData(){
    messagesBeingTyped = [];
    for(let i = 0; i < remotePlayers.length; i++){
        if(remotePlayers[i]['id'] === getLocalPlayerData().id)
            continue;
        if(remotePlayers[i]['chatActive'])
            messagesBeingTyped.push(remotePlayers[i]['name'] + ': ' + remotePlayers[i]['chatMsg']);
    }
}

let messagesBeingTyped = [];

export function getMessagesBeingTyped(){
    return messagesBeingTyped;
}

function playersAreEqualEnough(player1, player2){
    if(player1 === null || player2 === null)
        return false;
    let out=true;
    out = out && player1.position.equals(player2.position);
    out = out && player1.quaternion.equals(player2.quaternion);
    out = out && player1.chatMsg === player2.chatMsg;

    return out;
}

export function getRemotePlayerData(){
    return remotePlayers;
}

export function sendMessage(msg){
    const chatMessage = {
        message: msg,
        id: getLocalPlayerData().id,
        name: getLocalPlayerData().name,
    };
    if(msg.length<1) return;
    socket.emit('chatMsg', chatMessage);
    if(msg.charAt(0) === '/')
        return;
    CHAT.addChatMessage(chatMessage);
}


