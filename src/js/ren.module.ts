import * as THREE from 'three';
import * as NETWORKING  from './networking.module.ts';
import * as MAIN from './main.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from "three/addons/loaders/DRACOLoader.js";
import * as CHAT from './chat.module.ts'

const scene = new THREE.Scene();

const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera( 90, window.innerWidth / window.innerHeight, 0.01, 1000 );

const renderer = new THREE.WebGLRenderer();
document.body.appendChild( renderer.domElement );
renderer.domElement.style.imageRendering = 'pixelated';
renderer.setAnimationLoop(null);

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader( dracoLoader );

let possumGLTFScene = undefined;


// Load a glTF resource
loader.load(
    // resource URL
    'models/simplified_possum.glb',
    // called when the resource is loaded
    function ( gltf ) {
        possumGLTFScene = gltf.scene;
        },
    function ( xhr ) {},
    function ( error ) {console.log( 'possum loading error' );}
);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
scene.fog = new THREE.FogExp2('#111111',0.1)

let playersToRender = [];
let deltaTime = 1;


export function doFrame(localPlayer){
    deltaTime = clock.getDelta();

    renderer.render( scene, camera );
    renderer.autoClear = false;
    renderer.render( CHAT.getScene(), camera)
    renderer.autoClear = true;

    camera.position.copy(localPlayer.position)

    updateRemotePlayers();
    updateFramerate();

}

let framerate = 0;
let framesInFramerateSample = 100;
let sampleOn = 0;
let lastFramerateCalculation = 0;
function updateFramerate(){
    sampleOn++;
    if(sampleOn>=framesInFramerateSample){
        framerate = framesInFramerateSample / (Date.now()/1000 - lastFramerateCalculation);

        sampleOn = 0;
        lastFramerateCalculation = Date.now()/1000;
    }
}

export function getFramerate(){
    return framerate;
}



function updateRemotePlayers() {
    if (possumGLTFScene === undefined) return;

    const remotePlayerData = NETWORKING.getRemotePlayerData();
    const localPlayerId = MAIN.getLocalPlayerData()['id'];

    // Update existing players and add new players
    remotePlayerData.forEach(remotePlayer => {
        if (remotePlayer.id === localPlayerId) return; // Skip local player

        const existingPlayer = playersToRender.find(player => player.id === remotePlayer.id);

        if (existingPlayer) {
            updatePlayerPosition(existingPlayer.object, remotePlayer);
        } else {
            addNewPlayer(remotePlayer);
        }
    });

    // Remove players that are no longer in remotePlayerData
    removeInactivePlayers(remotePlayerData);
}

function updatePlayerPosition(playerObject, remotePlayerData) {
    playerObject.position.set(
        remotePlayerData.position.x,
        remotePlayerData.position.y,
        remotePlayerData.position.z
    );

    playerObject.quaternion.set(
        remotePlayerData.quaternion[0],
        remotePlayerData.quaternion[1],
        remotePlayerData.quaternion[2],
        remotePlayerData.quaternion[3]
    );

    let velocity = Math.sqrt(Math.pow(remotePlayerData.velocity.x,2) + Math.pow(remotePlayerData.velocity.y,2) + Math.pow(remotePlayerData.velocity.z,2));
    if(velocity>0)
        playerObject.position.add(new THREE.Vector3(0,0.2*(0.5+Math.sin(Date.now()/1000*20)),0));

    // Apply additional rotation
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    playerObject.quaternion.multiply(rotationQuaternion);


}

function addNewPlayer(remotePlayerData) {
    const newPlayer = {
        id: remotePlayerData.id,
        object: possumGLTFScene.clone() // Clone the GLTF scene for the new player
    };
    playersToRender.push(newPlayer);
    scene.add(newPlayer.object);
}

function removeInactivePlayers(remotePlayerData) {
    playersToRender = playersToRender.filter(player => {
        const isActive = remotePlayerData.some(remotePlayer => remotePlayer.id === player.id);
        if (!isActive) {
            scene.remove(player.object);
        }
        return isActive;
    });
}





onWindowResize();
window.addEventListener('resize', onWindowResize, false);
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

