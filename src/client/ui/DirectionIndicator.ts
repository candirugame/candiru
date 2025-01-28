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
		this.camera = new THREE.PerspectiveCamera(10, 1, 0.1, 20);
		this.camera.position.set(0, 8, -3);
		this.camera.lookAt(0, 0, 0);
	}

	public init() {
		this.loadModel('models/arrow.glb')
			.then((model) => {
				this.directionObject = model;
				this.directionObject.traverse((child: THREE.Object3D) => {
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
		this.scene.fog = new THREE.Fog(0xee0000, 5, 13);
	}
	public onFrame(deltaTime: number) {
		const worldVector = this.localPlayer.directionIndicatorVector;
		if (!worldVector) {
			if (this.sceneAdded && this.directionObject) {
				this.scene.remove(this.directionObject);
				this.sceneAdded = false;
			}
			return;
		}

		if (!this.directionObject || !this.sceneAdded || !worldVector) {
			if (!this.sceneAdded && this.directionObject) {
				this.scene.add(this.directionObject);
				this.sceneAdded = true;
			}
			return;
		}

		const playerPosition = this.localPlayer.position;
		const playerRotation = this.localPlayer.lookQuaternion.clone().normalize();

		// Calculate direction from player to target
		const direction = new THREE.Vector3()
			.copy(worldVector)
			.sub(playerPosition)
			.normalize();

		// Convert to local space
		const inverseRotation = playerRotation.clone().invert();
		const localDirection = direction.clone().applyQuaternion(inverseRotation);

		// Calculate horizontal angle
		const horizontalAngle = Math.atan2(localDirection.x, localDirection.z);

		// Calculate vertical angle
		const verticalAngle = Math.atan2(
			localDirection.y,
			Math.sqrt(
				localDirection.x * localDirection.x +
					localDirection.z * localDirection.z,
			),
		);

		// Create target quaternion
		const targetRotation = new THREE.Quaternion()
			.setFromEuler(new THREE.Euler(verticalAngle, 0, -horizontalAngle));

		// Get current rotation as quaternion
		const currentRotation = new THREE.Quaternion()
			.setFromEuler(this.directionObject.rotation);

		// Smoothly interpolate between current and target rotation
		this.moveTowardsRot(currentRotation, targetRotation, deltaTime * 60 * 0.2); // Adjust the multiplier to control rotation speed

		// Apply the interpolated rotation
		this.directionObject.quaternion.copy(currentRotation);
	}

	protected setupScissorAndViewport(): void {
		const screenWidth = globalThis.innerWidth;
		const screenHeight = globalThis.innerHeight;

		// Smaller size
		const directionIndicatorWidth = 40;
		const directionIndicatorHeight = 40;

		// Center bottom placement
		const xOffset = (screenWidth - directionIndicatorWidth * this.parentRenderer.getScreenPixelsInGamePixel()) / 2;
		const yOffset = screenHeight - (directionIndicatorHeight + 150) * this.parentRenderer.getScreenPixelsInGamePixel();

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
