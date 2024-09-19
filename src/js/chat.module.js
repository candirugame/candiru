import * as RENDERER from './ren.module.js';
import * as THREE from 'three';
import * as MAIN from './main.js'
import * as NETWORKING from './networking.module.js'
if (import.meta.hot) {import.meta.hot.accept(() => {});}


let scene = new THREE.Scene();

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.addEventListener('keydown', onKeyDown);

let chatMessages = [];



function renderChatMessages(){
    let usermsg = MAIN.getLocalPlayerData().chatMsg;
    let cursor = '';
    if(Date.now()/1000 % 0.7 < 0.7/2 && MAIN.getLocalPlayerData().chatActive) cursor = '|';
    let linesToRender = [];
    if(MAIN.getLocalPlayerData().chatActive)
        linesToRender.push(usermsg+cursor)

    for(let i = chatMessages.length-1; i>=0; i--){
        linesToRender.push(chatMessages[i]['message']);
    }

    ctx.font = '8px Tiny5';
    ctx.fillStyle = 'white';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for(let i = 0; i < linesToRender.length; i++)
        ctx.fillText(linesToRender[i], 256 + 3, 200 - 40 - 8*i);


    if(usermsg !== ''){
        ctx.fillStyle = 'rgba(145,142,118,0.3)';
        let width = ctx.measureText(usermsg).width;
        ctx.fillRect(256+2,200-40-7,width+1,9)
    }

    // Update the texture
    texture.needsUpdate = true;
}



function onKeyDown(e) {

    if(e.key === 'Backspace' && MAIN.getLocalPlayerData().chatActive){
        MAIN.getLocalPlayerData().chatMsg = MAIN.getLocalPlayerData().chatMsg.slice(0, -1);
        return;
    }

    if(e.key === "Enter")
        NETWORKING.sendMessage(MAIN.getLocalPlayerData().chatMsg);

    if(e.key === "Escape" || e.key === "Enter"){
        MAIN.getLocalPlayerData().chatMsg = ''
        MAIN.getLocalPlayerData().chatActive=false;
    }
    

    if(MAIN.getLocalPlayerData().chatActive && e.key.length<3)
        MAIN.getLocalPlayerData().chatMsg += e.key;

    if(e.key.toLowerCase()==="t")
        MAIN.getLocalPlayerData().chatActive = true;
}

export function addChatMessage(msg){
    msg['timestamp'] = Date.now()/1000;
    chatMessages.push(msg);
}



canvas.width = 512;
canvas.height = 200;


// Create a texture from the canvas
const texture = new THREE.CanvasTexture(canvas);


// Create a plane geometry and apply the texture
const geometry = new THREE.PlaneGeometry(canvas.width, canvas.height);
const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true
});
const plane = new THREE.Mesh(geometry, material);

// Scale down the plane to make it visible
const scaleFactor = 0.001; // Adjust this value as needed
plane.scale.set(scaleFactor, scaleFactor, scaleFactor);

let addedToScene = false;




export function onFrame() {
    if (!addedToScene) {
        scene.add(plane);
        addedToScene = true;
    }

renderChatMessages();

    const camera = RENDERER.getCamera();
    const distanceFromCamera = 0.1; // Distance in front of the camera

    // Calculate the position of the left edge of the camera's view frustum at the given distance
    const frustumHeight = 2 * distanceFromCamera * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const frustumWidth = frustumHeight * camera.aspect;
    const leftEdgeX = -frustumWidth / 2;

    // Calculate the new position in front of the camera
    const vector = new THREE.Vector3(leftEdgeX, 0, -distanceFromCamera);
    vector.applyMatrix4(camera.matrixWorld);

    plane.position.set(vector.x, vector.y, vector.z);

    // Align the plane to face the camera
    plane.quaternion.copy(camera.quaternion);
}


export function getScene() {
    return scene;
}
