import * as THREE from 'three';
import { Networking, type RemotePlayer } from './Networking.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Player } from './Player.ts';
import { ChatOverlay } from "../ui/ChatOverlay.ts";
import { RemotePlayerRenderer } from './RemotePlayerRenderer.ts';

export class Renderer {
    private clock: THREE.Clock;
    private deltaTime: number = 0;
    private chatOverlay: ChatOverlay;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private loader: GLTFLoader;
    private dracoLoader: DRACOLoader;
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
    public scaredLevel: number = 0;
    private lastPlayerHealth: number = 100;
    private knockbackVector: THREE.Vector3 = new THREE.Vector3();

    private gameIndex: number = 0;
    private gameCount: number = 0;

    public crosshairIsFlashing: boolean = false;
    public lastShotSomeoneTimestamp: number = 0;
    private healthIndicatorScene: THREE.Scene;
    private healthIndicatorCamera: THREE.PerspectiveCamera;
    private screenPixelsInGamePixel: number = 1;
    private inventoryMenuScene: THREE.Scene;
    private inventoryMenuCamera: THREE.OrthographicCamera;
    private remotePlayerRenderer: RemotePlayerRenderer;

    constructor(networking: Networking, localPlayer: Player, chatOverlay: ChatOverlay) {
        this.networking = networking;
        this.localPlayer = localPlayer;
        this.chatOverlay = chatOverlay;


        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(90, globalThis.innerWidth / globalThis.innerHeight, 0.01, 1000);
        this.renderer = new THREE.WebGLRenderer();
        document.body.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.setAnimationLoop(null);


        this.loader = new GLTFLoader();
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('/draco/');
        this.loader.setDRACOLoader(this.dracoLoader);

        // Create a new scene and camera for the held item
        this.heldItemScene = new THREE.Scene();
        this.heldItemCamera = new THREE.PerspectiveCamera(90, globalThis.innerWidth / globalThis.innerHeight, 0.01, 1000);
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

        // Fog settings
        this.scene.fog = new THREE.FogExp2('#111111', 0.05);
        this.heldItemScene.fog = new THREE.FogExp2('#111111', 0.05);
        this.healthIndicatorScene.fog = new THREE.FogExp2('#111111', 0.05); // Add fog to health indicator scene

        this.framerate = 0;
        this.framesInFramerateSample = 30;
        this.sampleOn = 0;
        this.lastFramerateCalculation = 0;

        this.raycaster = new THREE.Raycaster();

        // Initialize remotePlayerRenderer
        this.remotePlayerRenderer = new RemotePlayerRenderer(
            this.networking,
            this.localPlayer,
            this.raycaster,
            this.camera,
            this.scene
        );
        this.remotePlayerRenderer.getEntityScene().fog = new THREE.FogExp2('#111111', 0.1); // Add fog to remote players scene
        this.remotePlayerRenderer.getEntityScene().add(ambientLight3); // Add ambient light to remote players scene

        this.onWindowResize();
        globalThis.addEventListener('resize', this.onWindowResize.bind(this), false);


    }

    public onFrame(localPlayer: Player, gameIndex: number, gameCount: number) {
        this.deltaTime = this.clock.getDelta();

        // Ensure the renderer clears the buffers before the first render
        this.renderer.autoClear = true;

        // Render the main scene
        this.renderer.render(this.scene, this.camera);

        // Prevent clearing the buffers in subsequent renders
        this.renderer.autoClear = false;

        // Update and render remote players
        this.remotePlayerRenderer.update(this.deltaTime);
        this.renderer.render(this.remotePlayerRenderer.getEntityScene(), this.camera);

        // Render the held item scene normally (full screen)
        this.renderer.render(this.heldItemScene, this.heldItemCamera);

        // Set up the scissor and viewport for the health indicator scene rendering
        const screenWidth = globalThis.innerWidth;
        const screenHeight = globalThis.innerHeight;

        const healthIndicatorWidth = 60; // native
        const healthIndicatorHeight = healthIndicatorWidth; // 1:1 aspect ratio

        // Set up scissor and viewport for a region from (0, 0) to (50, 50)
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(
            2 * this.screenPixelsInGamePixel,
            screenHeight - (healthIndicatorHeight + 1 + this.chatOverlay.getDebugTextHeight()) * this.screenPixelsInGamePixel,
            healthIndicatorWidth * this.screenPixelsInGamePixel,
            healthIndicatorHeight * this.screenPixelsInGamePixel
        );
        this.renderer.setViewport(
            2 * this.screenPixelsInGamePixel,
            screenHeight - (healthIndicatorHeight + 1 + this.chatOverlay.getDebugTextHeight()) * this.screenPixelsInGamePixel,
            healthIndicatorWidth * this.screenPixelsInGamePixel,
            healthIndicatorHeight * this.screenPixelsInGamePixel
        );

        // Render the health indicator scene
        this.renderer.render(this.healthIndicatorScene, this.healthIndicatorCamera);

        // Render inventory view
        const inventoryWidth = 20;
        const inventoryHeight = inventoryWidth * 5;
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(
            screenWidth - (inventoryWidth + 4) * this.screenPixelsInGamePixel,
            screenHeight / 2 - (inventoryHeight / 2) * this.screenPixelsInGamePixel,
            inventoryWidth * this.screenPixelsInGamePixel,
            inventoryHeight * this.screenPixelsInGamePixel
        );
        this.renderer.setViewport(
            screenWidth - (inventoryWidth + 4) * this.screenPixelsInGamePixel,
            screenHeight / 2 - (inventoryHeight / 2) * this.screenPixelsInGamePixel,
            inventoryWidth * this.screenPixelsInGamePixel,
            inventoryHeight * this.screenPixelsInGamePixel
        );
        this.renderer.render(this.inventoryMenuScene, this.inventoryMenuCamera);

        // Reset scissor test and viewport after rendering the health indicator
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, screenWidth, screenHeight);


        // Restore autoClear to true if necessary
        this.renderer.autoClear = true;

        // Update camera position and rotation for local player
        this.camera.position.copy(localPlayer.position);
        this.camera.setRotationFromQuaternion(this.localPlayer.lookQuaternion);

        this.camera.position.add(this.knockbackVector);
        this.knockbackVector.lerp(new THREE.Vector3(), 0.05 * this.deltaTime * 60);


        if(this.localPlayer.health < this.lastPlayerHealth) {
            const remotePlayer: RemotePlayer | undefined = this.networking.getRemotePlayerData().find((player) => player.id === this.localPlayer.idLastDamagedBy);
            if(remotePlayer !== undefined) {
                console.log("Player was damaged by " + remotePlayer.name);
                const diff = new THREE.Vector3().subVectors(this.localPlayer.position, remotePlayer.position);
                this.knockbackVector.copy(diff.normalize().multiplyScalar(0.2));
            }
        }


        const shakeAmount = 0.08 * Math.pow(this.scaredLevel,5);
        this.camera.position.add(new THREE.Vector3((Math.random()-0.5) * shakeAmount, (Math.random()-0.5) *shakeAmount, (Math.random()-0.5) * shakeAmount));
        this.camera.rotation.x += (Math.random()-0.5) * shakeAmount * 0.12;
        this.camera.rotation.y += (Math.random()-0.5) * shakeAmount * 0.12;
        this.camera.rotation.z += (Math.random()-0.5) * shakeAmount * 0.12;

        this.heldItemCamera.rotation.set((Math.random()-0.5) * shakeAmount, (Math.random()-0.5) * shakeAmount, (Math.random()-0.5) * shakeAmount );

        this.lastPlayerHealth = this.localPlayer.health;
        this.updateFramerate();

        if(this.gameCount != gameCount || this.gameIndex != gameIndex) {
            this.gameCount = gameCount;
            this.gameIndex = gameIndex;
            this.onWindowResize();
        }


    }

    private updateFramerate() {
        this.sampleOn++;
        if (this.sampleOn >= this.framesInFramerateSample) {
            this.framerate = this.framesInFramerateSample / (Date.now() / 1000 - this.lastFramerateCalculation);
            this.sampleOn = 0;
            this.lastFramerateCalculation = Date.now() / 1000;
        }
    }

    public getFramerate(): number {
        return this.framerate;
    }

    public getScene(): THREE.Scene {
        return this.scene;
    }

    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    public getHeldItemScene(): THREE.Scene {
        return this.heldItemScene;
    }

    public getHealthIndicatorScene(): THREE.Scene {
        return this.healthIndicatorScene;
    }

    public getInventoryMenuScene(): THREE.Scene {
        return this.inventoryMenuScene;
    }

    public getInventoryMenuCamera(): THREE.OrthographicCamera {
        return this.inventoryMenuCamera;
    }

    private onWindowResize() {
        let aspect = globalThis.innerWidth / globalThis.innerHeight;
        let width = "100%";
        let height = "100%";


        this.renderer.domElement.style.position = "absolute";
        this.chatOverlay.getChatCanvas().style.position = 'absolute';

        this.chatOverlay.getChatCanvas().style.imageRendering = 'pixelated';
        this.chatOverlay.getChatCanvas().style.zIndex = '1';


        // this.gameCount = 3;
        // this.gameIndex = 3;
        if(this.gameCount === 2){
            aspect/=2;
            width = "50%";
            this.renderer.domElement.style.top = "0";
            this.chatOverlay.getChatCanvas().style.top = "0";

            if(this.gameIndex === 1){
                this.renderer.domElement.style.right = "0";
                this.chatOverlay.getChatCanvas().style.right = "0";
            }
        }
        if(this.gameCount === 3 || this.gameCount === 4){
            width = "50%";
            height = "50%";


            if(this.gameIndex === 1){
                this.renderer.domElement.style.right = "0";
                this.renderer.domElement.style.top = "0";
                this.chatOverlay.getChatCanvas().style.right = "0";
                this.chatOverlay.getChatCanvas().style.top = "0";
            }
            if(this.gameIndex === 2){
                this.renderer.domElement.style.left = "0";
                this.renderer.domElement.style.bottom = "0";
                this.chatOverlay.getChatCanvas().style.left = "0";
                this.chatOverlay.getChatCanvas().style.bottom = "0";
            }
            if(this.gameIndex === 3){
                this.renderer.domElement.style.right = "0";
                this.renderer.domElement.style.bottom = "0";
                this.chatOverlay.getChatCanvas().style.right = "0";
                this.chatOverlay.getChatCanvas().style.bottom = "0";
            }


        }


        this.renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
        this.renderer.setPixelRatio(200 / globalThis.innerHeight);

        this.camera.aspect = aspect;
        this.heldItemCamera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.heldItemCamera.updateProjectionMatrix();

        this.renderer.domElement.style.width = width;
        this.renderer.domElement.style.height = height;

        this.chatOverlay.getChatCanvas().style.width = width;
        this.chatOverlay.getChatCanvas().style.height = height;


        this.screenPixelsInGamePixel = globalThis.innerHeight / 200;


    }

    public getRemotePlayerIDsInCrosshair(): number[] {
        return this.remotePlayerRenderer.getRemotePlayerIDsInCrosshair();
    }

    public getEntityScene(): THREE.Scene {
        return this.remotePlayerRenderer.getEntityScene();
    }
}
