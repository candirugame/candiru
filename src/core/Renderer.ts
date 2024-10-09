import * as THREE from 'three';
import { Networking } from './Networking';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Player } from './Player';
import { ChatOverlay } from "../ui/ChatOverlay";

export class Renderer {
    private clock: THREE.Clock;
    private deltaTime: number;
    private chatOverlay: ChatOverlay;
    private scene: THREE.Scene;
    private entityScene: THREE.Scene; // New scene for remote players
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private loader: GLTFLoader;
    private dracoLoader: DRACOLoader;
    private possumGLTFScene: THREE.Group;
    private playersToRender;
    private heldItemScene: THREE.Scene;
    private heldItemCamera: THREE.PerspectiveCamera;
    private ambientLight: THREE.AmbientLight;
    private framerate: number;
    private framesInFramerateSample: number;
    private sampleOn: number;
    private lastFramerateCalculation: number;
    private networking: Networking;
    private localPlayer: Player;
    private raycaster: THREE.Raycaster;
    private crosshairVec = new THREE.Vector2;
    public crosshairIsFlashing: boolean;
    private healthIndicatorScene: THREE.Scene;
    private healthIndicatorCamera: THREE.PerspectiveCamera;
    private screenPixelsInGamePixel: number;
    private inventoryMenuScene: THREE.Scene;
    private inventoryMenuCamera: THREE.OrthographicCamera;



    // New state tracking variables
    private isAnimating: { [id: number]: boolean } = {};
    private animationPhase: { [id: number]: number } = {};
    private previousVelocity: { [id: number]: number } = {};
    private lastRunningYOffset: { [id: number]: number } = {};

    constructor(networking: Networking, localPlayer: Player, chatOverlay: ChatOverlay) {
        this.networking = networking;
        this.localPlayer = localPlayer;
        this.chatOverlay = chatOverlay;

        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.entityScene = new THREE.Scene(); // Initialize the new scene
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
                this.entityScene.add(this.possumGLTFScene);
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

        // Create a new scene and camera for the health indicator
        this.healthIndicatorScene = new THREE.Scene();
        this.healthIndicatorCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 1000);
        this.healthIndicatorCamera.position.set(0, 0, 0);
        this.healthIndicatorCamera.lookAt(0, 0, 1);

        this.inventoryMenuScene = new THREE.Scene();
        this.inventoryMenuCamera = new THREE.OrthographicCamera(-0.5, 0.5, 2.5, -2.5, 0.01, 10);
        this.inventoryMenuCamera.position.set(0, 0, 5);
        this.inventoryMenuCamera.lookAt(0, 0, 0);
        this.inventoryMenuScene.add(this.inventoryMenuCamera);
        this.inventoryMenuScene.add(new THREE.AmbientLight(0xffffff, 0.5));


        // Ambient lights
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        const ambientLight2 = new THREE.AmbientLight(0xffffff, 0.5);
        const ambientLight3 = new THREE.AmbientLight(0xffffff, 0.5); // Ambient light for remote players scene

        this.scene.add(this.ambientLight);
        this.heldItemScene.add(ambientLight2);
        this.entityScene.add(ambientLight3); // Add ambient light to remote players scene

        // Fog settings
        this.scene.fog = new THREE.FogExp2('#111111', 0.1);
        this.heldItemScene.fog = new THREE.FogExp2('#111111', 0.1);
        this.entityScene.fog = new THREE.FogExp2('#111111', 0.1); // Add fog to remote players scene
        this.healthIndicatorScene.fog = new THREE.FogExp2('#111111', 0.1); // Add fog to health indicator scene

        this.framerate = 0;
        this.framesInFramerateSample = 30;
        this.sampleOn = 0;
        this.lastFramerateCalculation = 0;

        this.raycaster = new THREE.Raycaster();

        this.onWindowResize();
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }
    public onFrame(localPlayer: Player) {
        this.deltaTime = this.clock.getDelta();

        // Ensure the renderer clears the buffers before the first render
        this.renderer.autoClear = true;

        // Render the main scene
        this.renderer.render(this.scene, this.camera);

        // Prevent clearing the buffers in subsequent renders
        this.renderer.autoClear = false;

        // Render the remote players scene using the same camera
        this.renderer.render(this.entityScene, this.camera);

        // Render the held item scene normally (full screen)
        this.renderer.render(this.heldItemScene, this.heldItemCamera);

        // Set up the scissor and viewport for the health indicator scene rendering
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        const healthIndicatorWidth = 60; //native
        const healthIndicatorHeight = healthIndicatorWidth; // 1:1 aspect ratio

        // Set up scissor and viewport for a region from (0, 0) to (50, 50)
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(2 * this.screenPixelsInGamePixel, screenHeight - (healthIndicatorHeight + 1 + this.chatOverlay.getDebugTextHeight())* this.screenPixelsInGamePixel, healthIndicatorWidth * this.screenPixelsInGamePixel, healthIndicatorHeight* this.screenPixelsInGamePixel);
        this.renderer.setViewport(2* this.screenPixelsInGamePixel, screenHeight - (healthIndicatorHeight + 1 + this.chatOverlay.getDebugTextHeight())* this.screenPixelsInGamePixel, healthIndicatorWidth* this.screenPixelsInGamePixel, healthIndicatorHeight* this.screenPixelsInGamePixel);

        // Render the health indicator scene
        this.renderer.render(this.healthIndicatorScene, this.healthIndicatorCamera);


        //render inventory view
        const inventoryWidth = 20;
        const inventoryHeight = inventoryWidth * 5;
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(screenWidth - (inventoryWidth + 4) * this.screenPixelsInGamePixel, screenHeight/2 - inventoryHeight/2 * this.screenPixelsInGamePixel, inventoryWidth * this.screenPixelsInGamePixel, inventoryHeight* this.screenPixelsInGamePixel);
        this.renderer.setViewport(screenWidth - (inventoryWidth + 4)* this.screenPixelsInGamePixel, screenHeight/2 - inventoryHeight/2 * this.screenPixelsInGamePixel, inventoryWidth* this.screenPixelsInGamePixel, inventoryHeight* this.screenPixelsInGamePixel);
        this.renderer.render(this.inventoryMenuScene, this.inventoryMenuCamera);

        // Reset scissor test and viewport after rendering the health indicator
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, screenWidth, screenHeight);


        // Render the chat overlay
        const chatScene = this.chatOverlay.getChatScene();
        const chatCamera = this.chatOverlay.getChatCamera();
        chatScene.traverse((obj) => {
            if (obj.isMesh) {
                obj.renderOrder = 998; // Ensure it's rendered just before the held item
                obj.material.depthTest = false;
            }
        });
        this.renderer.render(chatScene, chatCamera);

        // Restore autoClear to true if necessary
        this.renderer.autoClear = true;

        // Update camera position and rotation for local player
        this.camera.position.copy(localPlayer.position);
        // this.camera.quaternion.copy(localPlayer.quaternion);

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

    private updatePlayerPosition(playerObject: THREE.Object3D, remotePlayerData) {
        // Compute current velocity magnitude
        const velocity = Math.sqrt(
            Math.pow(remotePlayerData.velocity.x, 2) +
            Math.pow(remotePlayerData.velocity.y, 2) +
            Math.pow(remotePlayerData.velocity.z, 2)
        );

        // Retrieve previous velocity (default to 0 if undefined)
        const prevVelocity = this.previousVelocity[remotePlayerData.id] || 0;

        // Check for velocity state changes
        if (prevVelocity === 0 && velocity > 0) {
            // Player started moving
            this.isAnimating[remotePlayerData.id] = true;
            this.animationPhase[remotePlayerData.id] = 0;
        } else if (prevVelocity > 0 && velocity === 0) {
            // Player stopped moving but continue animation until cosine crosses zero
            // No action needed here
        }

        // Update previous velocity for next frame
        this.previousVelocity[remotePlayerData.id] = velocity;

        // Update position based on velocity and deltaTime
        playerObject.position.x += remotePlayerData.velocity.x * this.deltaTime;
        playerObject.position.y += remotePlayerData.velocity.y * this.deltaTime;
        playerObject.position.z += remotePlayerData.velocity.z * this.deltaTime;

        // If forced position, set directly
        if (remotePlayerData.forced) {
            playerObject.position.x = remotePlayerData.position.x;
            playerObject.position.y = remotePlayerData.position.y;
            playerObject.position.z = remotePlayerData.position.z;
        }

        // Lerp position for smooth movement
        playerObject.position.lerp(
            new THREE.Vector3(
                remotePlayerData.position.x,
                remotePlayerData.position.y,
                remotePlayerData.position.z
            ),
            0.3 * this.deltaTime * 60
        );

        // Slerp rotation for smooth orientation changes
        const targetQuaternion = new THREE.Quaternion(
            remotePlayerData.quaternion[0],
            remotePlayerData.quaternion[1],
            remotePlayerData.quaternion[2],
            remotePlayerData.quaternion[3]
        );
        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        targetQuaternion.multiply(rotationQuaternion);

        playerObject.quaternion.slerp(targetQuaternion, 0.5 * this.deltaTime * 60);

        // Apply animation offset after LERP and rotation updates
        if (this.isAnimating[remotePlayerData.id]) {
            // Update animation phase
            const frequency = 25; // Adjust frequency as desired
            this.animationPhase[remotePlayerData.id] += this.deltaTime * frequency;

            // Compute Y offset
            const amplitude = 0.02; // Adjust amplitude as desired
            const yOffset = amplitude * (1 + Math.cos(this.animationPhase[remotePlayerData.id]));
            
            // Apply new Y offset
            playerObject.position.y += yOffset;
            this.lastRunningYOffset[remotePlayerData.id] = yOffset;

            // Check if we should stop animating
            if (velocity === 0 && Math.cos(this.animationPhase[remotePlayerData.id]) <= 0) {
                // Cosine has crossed zero; stop animating
                this.isAnimating[remotePlayerData.id] = false;
                this.lastRunningYOffset[remotePlayerData.id] = 0;
            }
        } else {
            // Ensure Y offset is reset when not animating
            this.lastRunningYOffset[remotePlayerData.id] = 0;
        }
    }

    private addNewPlayer(remotePlayerData) {
        const object = this.possumGLTFScene.children[0].clone();
        const newPlayer = {
            id: remotePlayerData.id,
            object: object,
            objectUUID: object.uuid
        };
        this.playersToRender.push(newPlayer);
        this.entityScene.add(newPlayer.object); // Add to remote players scene
    }

    private removeInactivePlayers(remotePlayerData) {
        this.playersToRender = this.playersToRender.filter((player) => {
            const isActive = remotePlayerData.some((remotePlayer) => remotePlayer.id === player.id);
            if (!isActive) {
                this.entityScene.remove(player.object); // Remove from remote players scene
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

    public getHealthIndicatorScene() {
        return this.healthIndicatorScene;
    }
    public getInventoryMenuScene() {
        return this.inventoryMenuScene;
    }
    public getInventoryMenuCamera() {
        return this.inventoryMenuCamera;
    }

    public getEntityScene(){
        return this.entityScene;
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(200 / window.innerHeight);

        this.screenPixelsInGamePixel =  window.innerHeight / 200;
        // Update held item camera aspect ratio
        this.heldItemCamera.aspect = window.innerWidth / window.innerHeight;
        this.heldItemCamera.updateProjectionMatrix();

        // Update chat camera aspect ratio
        const chatCamera = this.chatOverlay.getChatCamera();
        chatCamera.aspect = window.innerWidth / window.innerHeight;
        chatCamera.updateProjectionMatrix();
    }

    private getRemotePlayerObjectsInCrosshair(): THREE.Object3D[] {
        this.raycaster.setFromCamera(this.crosshairVec, this.camera);
        return this.raycaster.intersectObjects(this.entityScene.children);
    }

    private getPlayersInCrosshairWithWalls() {
        const out = this.getRemotePlayerObjectsInCrosshair();
        const walls = this.raycaster.intersectObjects(this.scene.children);
        for (let i = out.length - 1; i >= 0; i--) {
            for (const wall of walls) {
                if (out[i].distance > wall.distance) out.splice(i, 1);
                break;
            }
        }

        return out;
    }

    public getRemotePlayerIDsInCrosshair(): number[] {
        const playerIDs: number[] = [];
        const objectsInCrosshair = this.getPlayersInCrosshairWithWalls();

        for (const object of objectsInCrosshair) {
            for (const player of this.playersToRender) {
                if (player.objectUUID === object.object.uuid) {
                    if (playerIDs.indexOf(player.id) === -1) playerIDs.push(player.id);
                    break;
                }
            }
        }

        return playerIDs;
    }
}