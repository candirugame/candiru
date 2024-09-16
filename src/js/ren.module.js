import * as THREE from 'three';
import * as NETWORKING  from './networking.module.js';
import * as MAIN from './main.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from "three/addons/loaders/DRACOLoader.js";

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

export function doFrame(localPlayer){
    let deltaTime = clock.getDelta();

    renderer.render( scene, camera );

    camera.position.copy(localPlayer.position)
    camera.position.add(new THREE.Vector3(0, 0.1016, 0)) //4 inches tall?

    updateRemotePlayers();

}


function updateRemotePlayers() {
    if (possumGLTFScene === undefined) return;

    let remotePlayerData = NETWORKING.getRemotePlayerData();

    // Update existing players and add new players
    for (let i = 0; i < remotePlayerData.length; i++) {
        //skip localPlayer
        if(remotePlayerData[i]['id'] === MAIN.getLocalPlayerData()['id'])
            continue;

        let playerFound = false;

        for (let j = 0; j < playersToRender.length; j++) {
            if (remotePlayerData[i]['id'] === playersToRender[j]['id']) {
                // Update player position
                playersToRender[j]['object'].position.set(
                    remotePlayerData[i]['position'].x,
                    remotePlayerData[i]['position'].y,
                    remotePlayerData[i]['position'].z
                );
                playersToRender[j]['object'].quaternion.set(
                    remotePlayerData[i]['quaternion'][0],
                    remotePlayerData[i]['quaternion'][1],
                    remotePlayerData[i]['quaternion'][2],
                    remotePlayerData[i]['quaternion'][3]
                )
                let rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
                playersToRender[j]['object'].quaternion.multiply(rotationQuaternion);
                console.log(remotePlayerData[i])
                playerFound = true;
                break;
            }
        }

        if (!playerFound) {
            // Add new player
            let newPlayer = {
                id: remotePlayerData[i]['id'],
                object: possumGLTFScene.clone() // Clone the GLTF scene for the new player
            };
            newPlayer.object.position.set(
                remotePlayerData[i]['position'].x,
                remotePlayerData[i]['position'].y,
                remotePlayerData[i]['position'].z
            );
            playersToRender.push(newPlayer);
            scene.add(newPlayer.object);
        }
    }

    // Remove players that are no longer in remotePlayerData
    for (let i = playersToRender.length - 1; i >= 0; i--) {
        let playerFound = false;

        for (let j = 0; j < remotePlayerData.length; j++) {
            if (remotePlayerData[j]['id'] === playersToRender[i]['id']) {
                playerFound = true;
                break;
            }
        }

        if (!playerFound) {
            scene.remove(playersToRender[i]['object']);
            playersToRender.splice(i, 1);
        }
    }
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
