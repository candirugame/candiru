import * as THREE from 'three';
import { Networking } from './Networking';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Player } from './Player';

export class Renderer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private loader: GLTFLoader;
    private dracoLoader: DRACOLoader;
    private possumGLTFScene: THREE.Group;
    private playersToRender: any[];
    private heldItemScene: THREE.Scene;
    private heldItemCamera: THREE.PerspectiveCamera;
    private ambientLight: THREE.AmbientLight;
    private framerate: number;
    private framesInFramerateSample: number;
    private sampleOn: number;
    private lastFramerateCalculation: number;
    private networking: Networking;
    private localPlayer: Player;

    constructor(networking: Networking, localPlayer: Player) {
        this.networking = networking;
        this.localPlayer = localPlayer;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 1000);
        this.renderer = new THREE.WebGLRenderer();
        document.body.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.setAnimationLoop(null);

        this.loader = new GLTFLoader();
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('/draco/');
        this.loader.setDRACOLoader(this.dracoLoader);

        this.possumGLTFScene = undefined;
        this.loader.load(
            'models/simplified_possum.glb',
            (gltf) => {
                this.possumGLTFScene = gltf.scene;
            },
            undefined,
            () => { console.log('possum loading error'); }
        );

        this.playersToRender = [];

        // Create a new scene and camera for the held item
        this.heldItemScene = new THREE.Scene();
        this.heldItemCamera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 1000);
        this.heldItemCamera.position.set(0, 0, 5);
        this.heldItemCamera.lookAt(0, 0, 0);

        // Ambient lights
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        const ambientLight2 = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(this.ambientLight);
        this.heldItemScene.add(ambientLight2);
        this.heldItemScene.fog = new THREE.FogExp2('#111111', 0.1);
        this.scene.fog = new THREE.FogExp2('#111111', 0.1);

        this.framerate = 0;
        this.framesInFramerateSample = 100;
        this.sampleOn = 0;
        this.lastFramerateCalculation = 0;

        this.onWindowResize();
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    public doFrame(localPlayer: Player) {
        this.renderer.render(this.scene, this.camera);
        this.renderer.autoClear = false;
        this.renderer.render(this.heldItemScene, this.heldItemCamera);
        this.renderer.autoClear = true;

        this.camera.position.copy(localPlayer.position);
        this.updateRemotePlayers();
        this.updateFramerate();
    }

    private updateRemotePlayers() {
        if (!this.possumGLTFScene) return;

        const remotePlayerData = this.networking.getRemotePlayerData();
        const localPlayerId = this.localPlayer.id;

        // Update existing players and add new players
        remotePlayerData.forEach((remotePlayer) => {
            if (remotePlayer.id === localPlayerId) return;
            const existingPlayer = this.playersToRender.find((player) => player.id === remotePlayer.id);
            if (existingPlayer) {
                this.updatePlayerPosition(existingPlayer.object, remotePlayer);
            } else {
                this.addNewPlayer(remotePlayer);
            }
        });

        // Remove players that are no longer in remotePlayerData
        this.removeInactivePlayers(remotePlayerData);
    }

    private updatePlayerPosition(playerObject: THREE.Object3D, remotePlayerData: any) {
        playerObject.position.set(
            remotePlayerData.position.x,
            remotePlayerData.position.y,
            remotePlayerData.position.z
        );

        playerObject.quaternion.set(
            remotePlayerData.quaternion.x,
            remotePlayerData.quaternion.y,
            remotePlayerData.quaternion.z,
            remotePlayerData.quaternion.w
        );

        const velocity = Math.sqrt(
            Math.pow(remotePlayerData.velocity.x, 2) +
            Math.pow(remotePlayerData.velocity.y, 2) +
            Math.pow(remotePlayerData.velocity.z, 2)
        );
        if (velocity > 0)
            playerObject.position.add(new THREE.Vector3(0, 0.2 * (0.5 + Math.sin(Date.now() / 1000 * 20)), 0));

        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        playerObject.quaternion.multiply(rotationQuaternion);
    }

    private addNewPlayer(remotePlayerData: any) {
        const newPlayer = {
            id: remotePlayerData.id,
            object: this.possumGLTFScene.clone()
        };
        this.playersToRender.push(newPlayer);
        this.scene.add(newPlayer.object);
    }

    private removeInactivePlayers(remotePlayerData: any[]) {
        this.playersToRender = this.playersToRender.filter((player) => {
            const isActive = remotePlayerData.some((remotePlayer) => remotePlayer.id === player.id);
            if (!isActive) {
                this.scene.remove(player.object);
            }
            return isActive;
        });
    }

    private updateFramerate() {
        this.sampleOn++;
        if (this.sampleOn >= this.framesInFramerateSample) {
            this.framerate = this.framesInFramerateSample / (Date.now() / 1000 - this.lastFramerateCalculation);
            this.sampleOn = 0;
            this.lastFramerateCalculation = Date.now() / 1000;
        }
    }

    public getFramerate() {
        return this.framerate;
    }

    public getScene() {
        return this.scene;
    }

    public getCamera() {
        return this.camera;
    }

    public getHeldItemScene() {
        return this.heldItemScene;
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(200 / window.innerHeight);

        // Update held item camera aspect ratio
        this.heldItemCamera.aspect = window.innerWidth / window.innerHeight;
        this.heldItemCamera.updateProjectionMatrix();
    }
}