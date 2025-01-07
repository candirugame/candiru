import * as THREE from 'three';
import { Player } from '../../shared/Player.ts';
import { IndicatorBase } from './IndicatorBase.ts';
import { Networking } from '../core/Networking.ts';
import { Renderer } from '../core/Renderer.ts';

const clock = new THREE.Clock();

export class HealthIndicator extends IndicatorBase {
	private possumObject!: THREE.Object3D;
	private sceneAdded: boolean = false;
	private targetQuaternion: THREE.Quaternion = new THREE.Quaternion(0, 0, 0, 1);
	private targetPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
	private rotatedAngle: number = 0;
	private lastHealth: number = 0;
	private lastHealthChangeWasDamage: boolean = false;
	private lightRGBI: number[] = [0, 0, 0, 0];

	constructor(
		parentRenderer: Renderer,
		localPlayer: Player,
		networking: Networking,
	) {
		super(parentRenderer, localPlayer, networking);
	}

	public init() {
		this.loadModel('models/simplified_possum.glb')
			.then((model) => {
				this.possumObject = model;
				this.possumObject.traverse((child) => {
					if ((child as THREE.Mesh).isMesh) {
						(child as THREE.Mesh).renderOrder = 999;
						this.applyDepthTest(child as THREE.Mesh);
					}
				});
			})
			.catch((error) => {
				console.log('HealthIndicator model loading error:', error);
			});
	}

	public onFrame(deltaTime: number) {
		if (!this.possumObject) return;
		if (!this.scene.children.includes(this.possumObject)) {
			this.scene.add(this.possumObject);
			this.sceneAdded = true;
		}

		let maxHealth = this.networking.getServerInfo().playerMaxHealth;
		if (maxHealth === 0) maxHealth = 0.001;

		const scaredLevel = 1 - Math.pow(this.localPlayer.health / maxHealth, 1); // 0-1

		this.parentRenderer.scaredLevel = scaredLevel;

		this.targetPosition.copy(basePosition);
		this.targetPosition.y += scaredLevel * 0.5 * Math.sin(1.1 * Math.PI * this.rotatedAngle);
		this.targetPosition.y += (Math.random() - 0.5) * 0.2 * scaredLevel;
		this.targetPosition.x += (Math.random() - 0.5) * 0.2 * scaredLevel;
		this.targetPosition.z += (Math.random() - 0.5) * 0.2 * scaredLevel;

		this.targetQuaternion.copy(baseQuaternion);
		this.rotateAroundWorldAxis(
			this.targetQuaternion,
			new THREE.Vector3(0, 0, 1),
			Math.PI - (this.localPlayer.health * Math.PI) / maxHealth,
		);

		this.rotatedAngle += (4 * deltaTime) / Math.max(0.001, (1 - scaredLevel) * 3);
		this.rotateAroundWorldAxis(this.targetQuaternion, new THREE.Vector3(0, 1, 0), this.rotatedAngle);

		this.moveTowardsPos(this.possumObject.position, this.targetPosition, 0.8 * deltaTime * 60);
		this.moveTowardsRot(this.possumObject.quaternion, this.targetQuaternion, 0.5 * deltaTime * 60);

		let targetRGBI: number[];

		if (!this.lastHealthChangeWasDamage && this.localPlayer.health < maxHealth && this.rotatedAngle % 2 > 1) {
			targetRGBI = [125, 255, 125, 1.2];
		} else {
			targetRGBI = [255, 255, 255, 0.5];
		}

		for (let i = 0; i < 4; i++) {
			this.lightRGBI[i] += (targetRGBI[i] - this.lightRGBI[i]) * 0.4 * deltaTime * 60;
		}
		this.ambientLight.intensity = this.lightRGBI[3];
		this.ambientLight.color = new THREE.Color(this.rgbToHex(this.lightRGBI[0], this.lightRGBI[1], this.lightRGBI[2]));

		if (this.lastHealth < this.localPlayer.health) {
			this.lastHealthChangeWasDamage = false;
		} else if (this.lastHealth > this.localPlayer.health) {
			this.lastHealthChangeWasDamage = true;
		}
		this.lastHealth = this.localPlayer.health;
	}

	protected setupScissorAndViewport(): void {
		const screenWidth = globalThis.innerWidth;
		const screenHeight = globalThis.innerHeight;

		const healthIndicatorWidth = 60; // native
		const healthIndicatorHeight = healthIndicatorWidth; // 1:1 aspect ratio

		this.scissor.set(
			2 * this.parentRenderer.getScreenPixelsInGamePixel(),
			screenHeight -
				(healthIndicatorHeight + 1 + this.parentRenderer.getChatOverlay().getDebugTextHeight()) *
					this.parentRenderer.getScreenPixelsInGamePixel(),
			healthIndicatorWidth * this.parentRenderer.getScreenPixelsInGamePixel(),
			healthIndicatorHeight * this.parentRenderer.getScreenPixelsInGamePixel(),
		);

		this.viewport.set(
			2 * this.parentRenderer.getScreenPixelsInGamePixel(),
			screenHeight -
				(healthIndicatorHeight + 1 + this.parentRenderer.getChatOverlay().getDebugTextHeight()) *
					this.parentRenderer.getScreenPixelsInGamePixel(),
			healthIndicatorWidth * this.parentRenderer.getScreenPixelsInGamePixel(),
			healthIndicatorHeight * this.parentRenderer.getScreenPixelsInGamePixel(),
		);
	}

	/**
	 * Override the applyDepthTest method to avoid naming conflicts.
	 * Applies depth testing adjustments to the mesh.
	 * @param mesh The mesh to modify.
	 */
	private applyDepthTestToMesh(mesh: THREE.Mesh) {
		super.applyDepthTest(mesh);
	}
}

const basePosition = new THREE.Vector3(0, 0, 1.2);
const baseQuaternion = new THREE.Quaternion(0, 0, 0, 1);
