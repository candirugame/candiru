import * as THREE from 'three';
import { Player } from '../../shared/Player.ts';
import { IndicatorBase } from './IndicatorBase.ts';
import { Networking } from '../core/Networking.ts';
import { Renderer } from '../core/Renderer.ts';

export class DirectionIndicator extends IndicatorBase {
	private directionObject!: THREE.Object3D;
	private sceneAdded: boolean = false;

	constructor(
		parentRenderer: Renderer,
		localPlayer: Player,
		networking: Networking,
	) {
		super(parentRenderer, localPlayer, networking);
		// Set up orthographic camera
		this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
		this.camera.position.set(0, 5, -3);
		this.camera.lookAt(0, 0, 0);
	}

	public init() {
		this.loadModel('models/arrow.glb')
			.then((model) => {
				this.directionObject = model;
				this.directionObject.traverse((child) => {
					if ((child as THREE.Mesh).isMesh) {
						(child as THREE.Mesh).renderOrder = 999;
						this.applyDepthTestToMesh(child as THREE.Mesh);
					}
				});
				// Scale down the direction object
				this.directionObject.scale.set(0.5, 0.5, 0.5);
			})
			.catch((error) => {
				console.log('DirectionIndicator model loading error:', error);
			});
		this.ambientLight.intensity = 0.5;
	}
	public onFrame(deltaTime: number) {
		if (!this.directionObject) return;
		if (!this.sceneAdded) {
			this.scene.add(this.directionObject);
			this.sceneAdded = true;
		}

		const worldVector = this.networking.getServerInfo().directionIndicatorVector;
		const playerPosition = this.localPlayer.position;
		const playerRotation = this.localPlayer.lookQuaternion.clone().normalize();

		// Calculate direction from player to target (reversed from your original)
		const direction = new THREE.Vector3()
			.copy(worldVector)
			.sub(playerPosition)
			.normalize();

		// Convert to local space
		const inverseRotation = playerRotation.clone().invert();
		const localDirection = direction.clone().applyQuaternion(inverseRotation);

		// Calculate angle and apply rotations
		this.directionObject.rotation.set(0, 0, 0);
		const angle = Math.atan2(localDirection.x, localDirection.z);
		this.directionObject.rotateZ(-angle);
	}

	protected setupScissorAndViewport(): void {
		const screenWidth = globalThis.innerWidth;
		const screenHeight = globalThis.innerHeight;

		// Smaller size
		const directionIndicatorWidth = 40;
		const directionIndicatorHeight = 40;

		// Center bottom placement
		const xOffset = (screenWidth - directionIndicatorWidth * this.parentRenderer.getScreenPixelsInGamePixel()) / 2;
		const yOffset = screenHeight - (directionIndicatorHeight + 130) * this.parentRenderer.getScreenPixelsInGamePixel();

		this.scissor.set(
			xOffset,
			yOffset,
			directionIndicatorWidth * this.parentRenderer.getScreenPixelsInGamePixel(),
			directionIndicatorHeight * this.parentRenderer.getScreenPixelsInGamePixel(),
		);

		this.viewport.set(
			xOffset,
			yOffset,
			directionIndicatorWidth * this.parentRenderer.getScreenPixelsInGamePixel(),
			directionIndicatorHeight * this.parentRenderer.getScreenPixelsInGamePixel(),
		);
	}

	private applyDepthTestToMesh(mesh: THREE.Mesh) {
		super.applyDepthTest(mesh);
	}
}
