import * as RENDERER from './ren.module.ts';
import * as THREE from 'three';
import * as MAIN from '../main.ts';
import * as NETWORKING from './networking.module.ts';
import { getRemotePlayerData } from "./networking.module.ts";
import { getLocalPlayerData } from "../main.ts";

if (import.meta.hot) { import.meta.hot.accept(() => {}); }

const scene = new THREE.Scene();
const chatScene = new THREE.Scene();
const chatCamera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 1000);



const chatCanvas = document.createElement('canvas');
const chatCtx = chatCanvas.getContext('2d');
chatCtx.imageSmoothingEnabled = false;
chatCanvas.width = 1024;
chatCanvas.height = 200;

document.addEventListener('keydown', onKeyDown);

const chatMessages = [];
const chatMessageLifespan = 40; // 20 seconds
const charsToRemovePerSecond = 30;
const maxMessagesOnScreen = 12;

function renderChatMessages(ctx) {
    ctx.font = '8px Tiny5';
    ctx.fillStyle = 'white';

    const usermsg = MAIN.getLocalPlayerData().chatMsg;
    let cursor = '';
    if (Date.now() / 1000 % 0.7 < 0.7 / 2) cursor = '|';

    const linesToRender = [];
    const pixOffsets = [];

    if (MAIN.getLocalPlayerData().chatActive) {
        linesToRender.push(usermsg + cursor);
        pixOffsets.push(0);
    }

    if (nameSettingActive) {
        linesToRender.push('Enter your name: ' + usermsg + cursor);
        pixOffsets.push(0);
    }

    const messagesBeingTyped = NETWORKING.getMessagesBeingTyped();
    for (let i = 0; i < messagesBeingTyped.length; i++) {
        linesToRender.push(messagesBeingTyped[i] + cursor);
        pixOffsets.push(0);
    }

    for (let i = chatMessages.length - 1; i >= 0; i--) {
        let msg = chatMessages[i]['message'];
        const name = chatMessages[i]['name'];
        if (name.length > 0)
            msg = name + ': ' + msg;

        let duplicateFromPlayerData = false;
        for (let i = 0; i < messagesBeingTyped.length; i++)
            if (messagesBeingTyped[i] === msg)
                duplicateFromPlayerData = true;

        let charsToRemove = Date.now() / 1000 - chatMessages[i]['timestamp'] - chatMessageLifespan;
        if (charsToRemove < 0) charsToRemove = 0;
        charsToRemove *= charsToRemovePerSecond;
        charsToRemove = Math.floor(charsToRemove);

        const removedSubstring = msg.substring(0, charsToRemove);
        msg = msg.substring(charsToRemove);

        if (!duplicateFromPlayerData) {
            linesToRender.push(msg);
            pixOffsets.push(ctx.measureText(removedSubstring).width);
        }
    }

    for (let i = 0; i < linesToRender.length; i++)
        ctx.fillText(linesToRender[i], chatCanvas.width/2 + 3 + pixOffsets[i], 200 - 40 - 8 * i);

    if ((usermsg !== '' && MAIN.getLocalPlayerData().chatActive) || nameSettingActive) {
        ctx.fillStyle = 'rgba(145,142,118,0.3)';
        let width = ctx.measureText(usermsg).width;
        if (nameSettingActive)
            width = ctx.measureText(usermsg + "Enter your name: ").width;
        ctx.fillRect(chatCanvas.width/2 + 2, 200 - 40 - 7, width + 1, 9);
    }
}

function renderDebugText(ctx) {
    ctx.font = '8px Tiny5';
    ctx.fillStyle = 'teal';

    const linesToRender = [];
    const framerate = RENDERER.getFramerate();
    const playerCount = getRemotePlayerData().length;
    const latency = getLocalPlayerData().latency;

    linesToRender.push(Math.floor(framerate) + 'FPS, ' + playerCount + ' online');
    linesToRender.push(Math.floor(latency) + 'ms');

    for (let i = 0; i < linesToRender.length; i++)
        ctx.fillText(linesToRender[i], chatCanvas.width/2 + 2, 7 + 7 * i);


}

function renderCrosshair(ctx) {
    ctx.fillStyle = 'rgb(0,255,225)';
    //create crosshair from 2 rectangles at the center
    ctx.fillRect(chatCanvas.width/2+screenWidth/2, 100-3, 1, 7);
    ctx.fillRect(chatCanvas.width/2+screenWidth/2-3, 100, 7, 1);

}

let nameSettingActive = false;

function onKeyDown(e) {
    if (e.key === 'Backspace' && (MAIN.getLocalPlayerData().chatActive || nameSettingActive)) {
        MAIN.getLocalPlayerData().chatMsg = MAIN.getLocalPlayerData().chatMsg.slice(0, -1);
        return;
    }

    if (e.key === "Enter") {
        if (MAIN.getLocalPlayerData().chatActive)
            NETWORKING.sendMessage(MAIN.getLocalPlayerData().chatMsg);
        if (nameSettingActive) {
            MAIN.getLocalPlayerData().name = MAIN.getLocalPlayerData().chatMsg.toString();
            localStorage.setItem('name', MAIN.getLocalPlayerData().name);
        }
    }

    if (e.key === "Escape" || e.key === "Enter") {
        MAIN.getLocalPlayerData().chatMsg = '';
        MAIN.getLocalPlayerData().chatActive = false;
        nameSettingActive = false;
    }

    if ((MAIN.getLocalPlayerData().chatActive || nameSettingActive) && e.key.length < 3)
        MAIN.getLocalPlayerData().chatMsg += e.key;

    if (e.key.toLowerCase() === "t" && !nameSettingActive) {
        if (MAIN.getLocalPlayerData().name.length > 0)
            MAIN.getLocalPlayerData().chatActive = true;
        else
            nameSettingActive = true;
    }

    if (e.key === '/' && !nameSettingActive && !MAIN.getLocalPlayerData().chatActive) {
        if (MAIN.getLocalPlayerData().name.length > 0) {
            MAIN.getLocalPlayerData().chatActive = true;
            MAIN.getLocalPlayerData().chatMsg = '/';
        } else {
            nameSettingActive = true;
        }
    }

    if (e.key.toLowerCase() === "n" && !MAIN.getLocalPlayerData().chatActive)
        nameSettingActive = true;
}

export function addChatMessage(msg) {
    msg['timestamp'] = Date.now() / 1000;
    chatMessages.push(msg);
}








// Scale down the plane to make it visible
const scaleFactor = 0.001; // Adjust this value as needed

const chatTexture = new THREE.CanvasTexture(chatCanvas);
chatTexture.minFilter = THREE.NearestFilter;
chatTexture.magFilter = THREE.NearestFilter;

const chatGeometry = new THREE.PlaneGeometry(chatCanvas.width, chatCanvas.height);
const chatMaterial = new THREE.MeshBasicMaterial({
    map: chatTexture,
    transparent: true
});

const chatPlane = new THREE.Mesh(chatGeometry, chatMaterial);
chatPlane.scale.set(scaleFactor, scaleFactor, scaleFactor);


let addedToScene = false;
let screenWidth = 100;
export function onFrame() {
    if (!addedToScene) {
        chatScene.add(chatPlane);
        addedToScene = true;
    }


    clearOldMessages();


    chatCtx.clearRect(0, 0, chatCanvas.width, chatCanvas.height);
    renderChatMessages(chatCtx);
    renderDebugText(chatCtx);
    renderCrosshair(chatCtx);
    chatTexture.needsUpdate = true;


    const distanceFromCamera = 0.1; // Distance in front of the camera
    const frustumHeight = 2 * distanceFromCamera * Math.tan(THREE.MathUtils.degToRad(chatCamera.fov / 2));
    const frustumWidth = frustumHeight * chatCamera.aspect;
    const leftEdgeX = -frustumWidth / 2;

    const vector = new THREE.Vector3(leftEdgeX, 0, -distanceFromCamera);
    vector.applyMatrix4(chatCamera.matrixWorld);
    chatPlane.position.set(vector.x, vector.y, vector.z);
    chatPlane.quaternion.copy(chatCamera.quaternion);

     screenWidth = RENDERER.getCamera().aspect * 200;
}

export function getScene() {
    return scene;
}

export function getChatScene() {
    return chatScene;
}

export function getChatCamera() {
    return chatCamera;
}

function clearOldMessages() {
    for (let i = 0; i < chatMessages.length; i++)
        if (Date.now() / 1000 - chatMessages[i]['timestamp'] > chatMessageLifespan + 5)
            chatMessages.splice(i, 1);

    for (let i = chatMessages.length - 1; i >= 0; i--) {
        if (i < chatMessages.length - maxMessagesOnScreen)
            chatMessages[i]['timestamp'] = Math.min(Date.now() / 1000 - chatMessageLifespan, chatMessages[i]['timestamp']);
    }
}
