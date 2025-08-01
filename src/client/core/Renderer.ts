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
import { ShotHandler } from './ShotHandler.ts';
import { PropRenderer } from './PropRenderer.ts';
import { Quaternion } from 'three';

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
	public targetZoom: number = 1;

	public crosshairIsFlashing: boolean = false;
	public lastShotSomeoneTimestamp: number = 0;
	public hitMarkerQueue: {
		hitPoint: THREE.Vector3;
		shotVector: THREE.Vector3;
		timestamp: number;
		type: 'player' | 'prop';
	}[] = [];

	private screenPixelsInGamePixel: number = 1;
	private inventoryMenuScene: THREE.Scene;
	private inventoryMenuCamera: THREE.OrthographicCamera;
	private remotePlayerRenderer: RemotePlayerRenderer;
	public propRenderer: PropRenderer;
	private inputHandler!: InputHandler;
	private collisionManager!: CollisionManager;

	private spectateGroundTruthPosition: THREE.Vector3 | null = null;

	// Add private shotHandler member
	private shotHandler!: ShotHandler;

	// List of indicators
	private indicators: IndicatorBase[] = [];
	private healthIndicator: HealthIndicator;
	private directionIndicator: DirectionIndicator;

	// difference from being scoped in
	public scopeOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

	public setScopeOffset(offset: THREE.Vector3) {
		this.scopeOffset.copy(offset);
	}

	private containerElement: HTMLElement;

	constructor(container: HTMLElement, networking: Networking, localPlayer: Player, chatOverlay: ChatOverlay) {
		this.networking = networking;
		this.localPlayer = localPlayer;
		this.chatOverlay = chatOverlay;
		this.containerElement = container;

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

		this.propRenderer = new PropRenderer(
			this.scene,
			this.networking,
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

	public destroy() {
		this.renderer.dispose();
		this.scene.clear();
		this.heldItemScene.clear();
		this.inventoryMenuScene.clear();
		this.remotePlayerRenderer.destroy();
		this.propRenderer.destroy();
		this.particleSystem.destroy();
		globalThis.removeEventListener('resize', this.onWindowResize.bind(this), false);
		globalThis.removeEventListener('orientationchange', this.onWindowResize.bind(this), false);
	}

	// Add setShotHandler method
	public setShotHandler(shotHandler: ShotHandler) {
		this.shotHandler = shotHandler;
		// Pass it down to RemotePlayerRenderer (we'll add this method next)
		this.remotePlayerRenderer.setShotHandler(shotHandler);
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
		this.remotePlayerRenderer.onFrame(this.deltaTime);
		this.propRenderer.onFrame(this.deltaTime);
		this.renderer.render(this.remotePlayerRenderer.getEntityScene(), this.camera);

		// Render the held item scene normally (full screen)
		this.renderer.render(this.heldItemScene, this.heldItemCamera);
		// Update and render indicators
		for (const indicator of this.indicators) {
			indicator.onFrame(this.deltaTime);
			indicator.render();
		}

		// Render inventory view
		const screenWidth = this.containerElement.clientWidth;
		const screenHeight = this.containerElement.clientHeight;

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
		let remotePlayer = undefined;
		if (localPlayer.playerSpectating !== -1) {
			remotePlayer = this.networking.getRemotePlayerData().find((player) => player.id === localPlayer.playerSpectating);
		}

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
		} else {
			this.spectateGroundTruthPosition = null;
			const tpDist = localPlayer.thirdPerson;
			if (tpDist && tpDist > 0) {
				// third-person camera: position behind player based on their look direction
				const heightOffset = 1.5; // camera height above player
				// world space backward vector = local (0,0,1) rotated by lookQuaternion
				const backward = new THREE.Vector3(0, 0, 1)
					.applyQuaternion(localPlayer.lookQuaternion)
					.multiplyScalar(tpDist);
				const camPos = localPlayer.position.clone()
					.add(backward)
					.add(new THREE.Vector3(0, heightOffset, 0));
				this.camera.position.copy(camPos);
				this.camera.lookAt(localPlayer.position);
			} else {
				// first-person camera
				this.camera.position.copy(localPlayer.position);
				this.camera.setRotationFromQuaternion(this.localPlayer.lookQuaternion);
			}
		}

		this.camera.position.add(this.knockbackVector);
		this.knockbackVector.lerp(new THREE.Vector3(), 0.05 * this.deltaTime * 60);

		if (this.localPlayer.health < this.lastPlayerHealth) {
			const remotePlayer: PlayerData | undefined = this.networking.getRemotePlayerData().find((player) =>
				player.id === this.localPlayer.idLastDamagedBy
			);
			if (remotePlayer !== undefined) {
				const diff = new THREE.Vector3().subVectors(
					this.localPlayer.position,
					new THREE.Vector3(
						remotePlayer.position.x,
						remotePlayer.position.y,
						remotePlayer.position.z,
					),
				);
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
			remotePlayer !== undefined
				? Math.pow(remotePlayer.velocity.x, 2) + Math.pow(remotePlayer.velocity.z, 2)
				: Math.pow(this.localPlayer.inputVelocity.x, 2) + Math.pow(this.localPlayer.inputVelocity.z, 2),
		);

		if (vel == 0 || this.collisionManager.isPlayerInAir()) {
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

		const playerVelocity = remotePlayer == undefined
			? new THREE.Vector3().copy(localPlayer.velocity)
			: new THREE.Vector3().copy(remotePlayer.velocity);

		if (remotePlayer == undefined) playerVelocity.applyQuaternion(localPlayer.lookQuaternion.clone().invert());
		else {playerVelocity.applyQuaternion(
				new Quaternion(
					remotePlayer.lookQuaternion.x,
					remotePlayer.lookQuaternion.y,
					remotePlayer.lookQuaternion.z,
					remotePlayer.lookQuaternion.w,
				).invert(),
			);}
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

		while (this.networking.particleQueue.length > 0) {
			const particle = this.networking.particleQueue.shift();
			if (particle) {
				this.particleSystem.emit(particle);
			}
		}

		this.particleSystem.update(this.deltaTime, this.camera.position.clone());

		const currentZoom = this.camera.zoom;
		const newZoom = currentZoom + (this.targetZoom - currentZoom) * 0.3 * this.deltaTime * 60;
		if (currentZoom !== newZoom) {
			this.camera.zoom = newZoom;
			this.camera.updateProjectionMatrix();
		}

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
		const position = this.camera.position.clone();
		const worldCentricOffset = this.scopeOffset.clone().applyQuaternion(this.camera.quaternion);
		worldCentricOffset.multiplyScalar(0.1); //
		position.add(worldCentricOffset);
		return position;
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

	public getShotVectorsToPropsWithOffset(
		yawOffset: number,
		pitchOffset: number,
		maxDistance: number = Infinity,
		origin: THREE.Vector3,
		baseDirection: THREE.Vector3,
	): { propID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		// Calculate shot direction with offset
		const worldUp = new THREE.Vector3(0, 1, 0);
		let right = new THREE.Vector3().crossVectors(baseDirection, worldUp).normalize();
		if (right.lengthSq() < 0.001) right = new THREE.Vector3(1, 0, 0);
		const up = new THREE.Vector3().crossVectors(right, baseDirection).normalize();

		const yawQuat = new THREE.Quaternion().setFromAxisAngle(up, yawOffset);
		const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, pitchOffset);
		const finalQuat = new THREE.Quaternion().multiplyQuaternions(yawQuat, pitchQuat);
		const shotDirection = baseDirection.clone().applyQuaternion(finalQuat).normalize();

		// Use the map from RemotePlayerRenderer to check for walls
		return this.propRenderer.getShotVectorsToPropsWithWallCheck(
			origin,
			shotDirection,
			maxDistance,
			RemotePlayerRenderer.getMap(),
		);
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
		// Get container dimensions instead of using global window dimensions
		const containerWidth = this.containerElement.clientWidth;
		const containerHeight = this.containerElement.clientHeight;

		// Update camera aspect ratio based on container dimensions
		this.camera.aspect = containerWidth / containerHeight;
		this.camera.updateProjectionMatrix();

		// Set renderer size to container dimensions
		this.renderer.setSize(containerWidth, containerHeight);
		this.renderer.setPixelRatio(200 / containerHeight);

		this.screenPixelsInGamePixel = containerHeight / 200;
		this.heldItemCamera.aspect = containerWidth / containerHeight;
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

	// Public method to trigger a resize
	public triggerResize() {
		this.onWindowResize();
	}
}
