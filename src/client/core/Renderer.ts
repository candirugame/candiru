import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { ChatOverlay } from '../ui/ChatOverlay.ts';
import { RemotePlayerRenderer } from './RemotePlayerRenderer.ts';
import { InputHandler } from '../input/InputHandler.ts';
import { SettingsManager } from './SettingsManager.ts';
import { CollisionManager } from '../input/CollisionManager.ts';
import { Player, PlayerData } from '../../shared/Player.ts';
import { IndicatorBase } from '../ui/IndicatorBase.ts';
import { HealthIndicator } from '../ui/HealthIndicator.ts';
import { DirectionIndicator } from '../ui/DirectionIndicator.ts';
import { ParticleSystem } from './ParticleSystem.ts';

export class Renderer {
	private clock: THREE.Clock;
	private deltaTime: number = 0;
	private chatOverlay: ChatOverlay;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private renderer: THREE.WebGLRenderer;
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
	private bobCycle: number;
	private lastCameraRoll: number;
	particleSystem: ParticleSystem;

	public crosshairIsFlashing: boolean = false;
	public lastShotSomeoneTimestamp: number = 0;
	public hitMarkerQueue: { hitPoint: THREE.Vector3; shotVector: THREE.Vector3; timestamp: number }[] = [];

	private screenPixelsInGamePixel: number = 1;
	private inventoryMenuScene: THREE.Scene;
	private inventoryMenuCamera: THREE.OrthographicCamera;
	private remotePlayerRenderer: RemotePlayerRenderer;
	private inputHandler!: InputHandler;
	private collisionManager!: CollisionManager;

	private spectateGroundTruthPosition: THREE.Vector3 | null = null;

	// List of indicators
	private indicators: IndicatorBase[] = [];
	private healthIndicator: HealthIndicator;
	private directionIndicator: DirectionIndicator;

	constructor(container: HTMLElement, networking: Networking, localPlayer: Player, chatOverlay: ChatOverlay) {
		this.networking = networking;
		this.localPlayer = localPlayer;
		this.chatOverlay = chatOverlay;

		this.clock = new THREE.Clock();
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(90, globalThis.innerWidth / globalThis.innerHeight, 0.01, 1000);
		this.renderer = new THREE.WebGLRenderer();
		container.appendChild(this.renderer.domElement);
		this.renderer.domElement.style.imageRendering = 'pixelated';
		this.renderer.setAnimationLoop(null);

		// Create a new scene and camera for the held item
		this.heldItemScene = new THREE.Scene();
		this.heldItemCamera = new THREE.PerspectiveCamera(90, globalThis.innerWidth / globalThis.innerHeight, 0.01, 1000);
		this.heldItemCamera.position.set(0, 0, 5);
		this.heldItemCamera.lookAt(0, 0, 0);

		this.inventoryMenuScene = new THREE.Scene();
		this.inventoryMenuCamera = new THREE.OrthographicCamera(-0.5, 0.5, 2.5, -2.5, 0.01, 10);
		this.inventoryMenuCamera.position.set(0, 0, 5);
		this.inventoryMenuCamera.lookAt(0, 0, 0);
		this.inventoryMenuScene.add(this.inventoryMenuCamera);
		this.inventoryMenuScene.add(new THREE.AmbientLight(0xffffff, 0.5));

		// Ambient lights
		this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		const ambientLight2 = new THREE.AmbientLight(0xffffff, 0.5);
		const ambientLight3 = new THREE.AmbientLight(0xffffff, 0.5);

		this.scene.add(this.ambientLight);
		this.heldItemScene.add(ambientLight2);

		// Fog settings
		this.scene.fog = new THREE.FogExp2('#111111', 0.05);
		this.heldItemScene.fog = new THREE.FogExp2('#111111', 0.05);

		this.framerate = 0;
		this.framesInFramerateSample = 30;
		this.sampleOn = 0;
		this.lastFramerateCalculation = 0;

		this.bobCycle = 0;
		this.lastCameraRoll = 0;

		this.raycaster = new THREE.Raycaster();

		// Initialize remotePlayerRenderer
		this.remotePlayerRenderer = new RemotePlayerRenderer(
			this.networking,
			this.localPlayer,
			this.raycaster,
			this.camera,
			this.scene,
		);
		this.remotePlayerRenderer.getEntityScene().fog = new THREE.FogExp2('#111111', 0.1);
		this.remotePlayerRenderer.getEntityScene().add(ambientLight3);
		this.renderer.domElement.style.touchAction = 'none';
		this.renderer.domElement.style.position = 'absolute';
		this.onWindowResize();
		globalThis.addEventListener('resize', this.onWindowResize.bind(this), false);
		globalThis.addEventListener('orientationchange', this.onWindowResize.bind(this), false);

		// Initialize indicators
		this.healthIndicator = new HealthIndicator(this, this.localPlayer, this.networking);
		this.indicators.push(this.healthIndicator);

		this.directionIndicator = new DirectionIndicator(this, this.localPlayer, this.networking);
		this.indicators.push(this.directionIndicator);

		// Initialize indicators
		this.healthIndicator.init();
		this.directionIndicator.init();

		this.particleSystem = new ParticleSystem(this.scene);
	}

	public onFrame(localPlayer: Player) {
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

		// Update and render indicators
		for (const indicator of this.indicators) {
			indicator.onFrame(this.deltaTime);
			indicator.render();
		}

		// Render inventory view
		const screenWidth = globalThis.innerWidth;
		const screenHeight = globalThis.innerHeight;

		const inventoryWidth = 20;
		const inventoryHeight = inventoryWidth * 5;
		this.renderer.setScissorTest(true);
		this.renderer.setScissor(
			screenWidth - (inventoryWidth + 4) * this.screenPixelsInGamePixel,
			screenHeight / 2 - (inventoryHeight / 2) * this.screenPixelsInGamePixel,
			inventoryWidth * this.screenPixelsInGamePixel,
			inventoryHeight * this.screenPixelsInGamePixel,
		);
		this.renderer.setViewport(
			screenWidth - (inventoryWidth + 4) * this.screenPixelsInGamePixel,
			screenHeight / 2 - (inventoryHeight / 2) * this.screenPixelsInGamePixel,
			inventoryWidth * this.screenPixelsInGamePixel,
			inventoryHeight * this.screenPixelsInGamePixel,
		);
		this.renderer.render(this.inventoryMenuScene, this.inventoryMenuCamera);

		// Reset scissor test and viewport
		this.renderer.setScissorTest(false);
		this.renderer.setViewport(0, 0, screenWidth, screenHeight);

		// Restore autoClear to true
		this.renderer.autoClear = true;

		if (localPlayer.playerSpectating !== -1) {
			const remotePlayer = this.networking.getRemotePlayerData().find((player) =>
				player.id === localPlayer.playerSpectating
			);
			if (remotePlayer !== undefined) {
				if (!this.spectateGroundTruthPosition) {
					this.spectateGroundTruthPosition = new THREE.Vector3(
						remotePlayer.position.x,
						remotePlayer.position.y,
						remotePlayer.position.z,
					);
				}

				this.spectateGroundTruthPosition.x += remotePlayer.velocity.x * this.deltaTime;
				this.spectateGroundTruthPosition.y += remotePlayer.velocity.y * this.deltaTime;
				this.spectateGroundTruthPosition.z += remotePlayer.velocity.z * this.deltaTime;

				if (remotePlayer.forced) {
					this.spectateGroundTruthPosition.set(
						remotePlayer.position.x,
						remotePlayer.position.y,
						remotePlayer.position.z,
					);
				}

				this.spectateGroundTruthPosition.lerp(
					new THREE.Vector3(
						remotePlayer.position.x,
						remotePlayer.position.y,
						remotePlayer.position.z,
					),
					0.1 * this.deltaTime * 60,
				);

				this.camera.position.copy(this.spectateGroundTruthPosition);

				this.camera.quaternion.slerp(
					new THREE.Quaternion(
						remotePlayer.lookQuaternion.x,
						remotePlayer.lookQuaternion.y,
						remotePlayer.lookQuaternion.z,
						remotePlayer.lookQuaternion.w,
					),
					0.3 * this.deltaTime * 60,
				);
			}
		} else {
			this.spectateGroundTruthPosition = null;
			this.camera.position.copy(localPlayer.position);
			this.camera.setRotationFromQuaternion(this.localPlayer.lookQuaternion);
		}

		this.camera.position.add(this.knockbackVector);
		this.knockbackVector.lerp(new THREE.Vector3(), 0.05 * this.deltaTime * 60);

		if (this.localPlayer.health < this.lastPlayerHealth) {
			const remotePlayer: PlayerData | undefined = this.networking.getRemotePlayerData().find((player) =>
				player.id === this.localPlayer.idLastDamagedBy
			);
			if (remotePlayer !== undefined) {
				const diff = new THREE.Vector3().subVectors(this.localPlayer.position, remotePlayer.position);
				this.knockbackVector.copy(diff.normalize().multiplyScalar(0.2));
			}
		}

		const shakeAmount = 0.08 * Math.pow(this.scaredLevel, 5);
		this.camera.position.add(
			new THREE.Vector3(
				(Math.random() - 0.5) * shakeAmount,
				(Math.random() - 0.5) * shakeAmount,
				(Math.random() - 0.5) * shakeAmount,
			),
		);
		this.camera.rotation.x += (Math.random() - 0.5) * shakeAmount * 0.12;
		this.camera.rotation.y += (Math.random() - 0.5) * shakeAmount * 0.12;
		this.camera.rotation.z += (Math.random() - 0.5) * shakeAmount * 0.12;

		this.heldItemCamera.rotation.set(
			(Math.random() - 0.5) * shakeAmount,
			(Math.random() - 0.5) * shakeAmount,
			(Math.random() - 0.5) * shakeAmount,
		);

		this.lastPlayerHealth = this.localPlayer.health;

		const vel = Math.sqrt(
			Math.pow(this.localPlayer.inputVelocity.x, 2) + Math.pow(this.localPlayer.inputVelocity.z, 2),
		);

		if (vel == 0 || this.collisionManager.isPlayerInAir() || this.localPlayer.playerSpectating !== -1) {
			this.bobCycle = 0;
		} else {
			this.bobCycle += this.deltaTime * 4.8 * vel;
			this.camera.position.y = this.camera.position.y +
				(Math.sin(this.bobCycle) * .03 * SettingsManager.settings.viewBobbingStrength);
		}

		let newHandX = Math.sin(this.bobCycle / 1.9) * .02 * SettingsManager.settings.viewBobbingStrength;
		let newHandY = -(Math.sin(this.bobCycle) * .07 * SettingsManager.settings.viewBobbingStrength);
		let newHandZ = Math.sin(this.bobCycle / 1.8) * .015 * SettingsManager.settings.viewBobbingStrength;
		newHandY += localPlayer.velocity.y * 0.04 * SettingsManager.settings.viewBobbingStrength;

		const playerVelocity = new THREE.Vector3().copy(localPlayer.velocity);
		playerVelocity.applyQuaternion(localPlayer.lookQuaternion.clone().invert());
		newHandX += playerVelocity.x * 0.02 * SettingsManager.settings.viewBobbingStrength;
		newHandZ -= -playerVelocity.z * 0.02 * SettingsManager.settings.viewBobbingStrength;

		if (this.inputHandler.getAim()) {
			newHandX *= 0.25;
			newHandY *= 0.25;
			newHandZ *= 0.25;
		}

		this.heldItemCamera.position.lerp(new THREE.Vector3(newHandX, newHandY, 5 + newHandZ), 0.15 * this.deltaTime * 60);

		const maxRollAmount = this.inputHandler.getInputX() * -.007 * SettingsManager.settings.viewBobbingStrength;
		const maxRollSpeed = this.deltaTime * .4;
		let roll: number = this.lastCameraRoll;
		roll = Renderer.approachNumber(roll, maxRollSpeed, maxRollAmount);
		const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
		euler.z += roll;
		this.lastCameraRoll = roll;

		this.camera.quaternion.setFromEuler(euler);

		this.scene.background = new THREE.Color(this.networking.getServerInfo().skyColor);

		this.particleSystem.update(this.deltaTime);

		this.updateFramerate();
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

	public getInventoryMenuScene(): THREE.Scene {
		return this.inventoryMenuScene;
	}

	public getInventoryMenuCamera(): THREE.OrthographicCamera {
		return this.inventoryMenuCamera;
	}

	public getWebGLRenderer(): THREE.WebGLRenderer {
		return this.renderer;
	}

	public getScreenPixelsInGamePixel(): number {
		return this.screenPixelsInGamePixel;
	}

	public getChatOverlay(): ChatOverlay {
		return this.chatOverlay;
	}

	public getMuzzlePosition(): THREE.Vector3 {
		return this.camera.position.clone();
	}

	public getMuzzleDirection(): THREE.Vector3 {
		const direction = new THREE.Vector3(0, 0, -1);
		direction.applyQuaternion(this.camera.quaternion); // Changed from heldItemCamera
		return direction;
	}

	public createScreenshot() {
		this.onFrame(this.localPlayer);

		const width = this.renderer.domElement.width;
		const height = this.renderer.domElement.height;

		const tempCanvas = document.createElement('canvas');
		tempCanvas.width = width;
		tempCanvas.height = height;
		const tempContext = tempCanvas.getContext('2d');

		if (tempContext) {
			// Capture the WebGL canvas as an image
			const webglImage = new Image();
			webglImage.src = this.renderer.domElement.toDataURL('image/png');

			webglImage.onload = () => {
				// Draw the WebGL canvas onto the temporary canvas
				tempContext.drawImage(webglImage, 0, 0, width, height);

				// Draw the chat overlay
				tempContext.drawImage(this.chatOverlay.chatCanvas, 0, 0, width, height);

				// Trigger a download of the combined image
				const dataURL = tempCanvas.toDataURL('image/png');
				const link = document.createElement('a');
				link.href = dataURL;
				link.download = 'screenshot.png';
				link.click();
			};
		}
	}

	public getShotVectorsToPlayersInCrosshair(
		maxDistance: number | undefined = undefined,
	): { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		return this.remotePlayerRenderer.getShotVectorsToPlayersInCrosshair(maxDistance);
	}

	public getPlayerSpheresInCrosshairWithWalls() {
		return this.remotePlayerRenderer.getPlayerSpheresInCrosshairWithWalls();
	}

	public getShotVectorsToPlayersWithOffset(
		yawOffset: number,
		pitchOffset: number,
		maxDistance: number = Infinity,
	): { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		return this.remotePlayerRenderer.getShotVectorsToPlayersWithOffset(yawOffset, pitchOffset, maxDistance);
	}

	public getEntityScene(): THREE.Scene {
		return this.remotePlayerRenderer.getEntityScene();
	}

	public setInputHandler(inputHandler: InputHandler) {
		this.inputHandler = inputHandler;
	}

	public setCollisionManager(collisionManager: CollisionManager) {
		this.collisionManager = collisionManager;
	}

	private onWindowResize() {
		this.camera.aspect = globalThis.innerWidth / globalThis.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
		this.renderer.setPixelRatio(200 / globalThis.innerHeight);

		this.screenPixelsInGamePixel = globalThis.innerHeight / 200;
		this.heldItemCamera.aspect = globalThis.innerWidth / globalThis.innerHeight;
		this.heldItemCamera.updateProjectionMatrix();
	}

	private static approachNumber(input: number, step: number, approach: number): number {
		if (input == approach) return approach;
		let output: number;
		if (input > approach) {
			output = input - step;
			if (output <= approach) return approach;
		} else {
			output = input + step;
			if (output >= approach) return approach;
		}
		return output;
	}
}
