import { ItemBase, ItemType } from './ItemBase.ts';
import { HeldItemInput } from '../input/HeldItemInput.ts';

import * as THREE from 'three';
import { Renderer } from '../core/Renderer.ts';
import { Networking } from '../core/Networking.ts';
import { AssetManager } from '../core/AssetManager.ts';

const firingDelay = .4;
const firingDelayHeld = 0.65; //longer firing delay when mouse is held down
const showInHandDelay = 0.1;
const unscopedPosition = new THREE.Vector3(1.3, -1, 3.2);
const hitPosition = new THREE.Vector3(0.1, -1, 2.9);
const hitQuaternion = new THREE.Quaternion(0.1388, -0.7948, 0.1982, -0.5565);
const inventoryQuaternionBase = new THREE.Quaternion(0, 0, 0.3827, -0.9239);
const scopedQuaternion = new THREE.Quaternion(0.1066, 0.8497, 0.1884, 0.4808);
const windBackQuaternion = new THREE.Quaternion(0.2081, 0.8216, 0.2802, 0.4506);
const hiddenPosition = new THREE.Vector3(0.85, -3.5, 3.2);

export class Pipe extends ItemBase {
	private renderer!: Renderer;
	private networking!: Networking;
	private lastInput: HeldItemInput;
	private lastFired: number;
	private addedToHandScene: boolean;

	// deno-lint-ignore constructor-super
	constructor(renderer: Renderer, networking: Networking, index: number, itemType: ItemType) {
		if (itemType === ItemType.WorldItem) {
			super(itemType, renderer.getEntityScene(), renderer.getInventoryMenuScene(), index);
		} else {
			super(itemType, renderer.getHeldItemScene(), renderer.getInventoryMenuScene(), index);
		}
		this.renderer = renderer;
		this.networking = networking;
		this.lastInput = new HeldItemInput();
		this.addedToHandScene = false;
		this.lastFired = 0;
	}

	public override init() {
		AssetManager.getInstance().loadAsset('models/simplified_rusty_pipe.glb', (scene) => {
			this.object = scene;
			if (this.itemType === ItemType.InventoryItem) {
				this.object.traverse((child) => {
					if ((child as THREE.Mesh).isMesh) {
						child.renderOrder = 999;
						const mesh = child as THREE.Mesh;
						if (Array.isArray(mesh.material)) {
							mesh.material.forEach((mat) => mat.depthTest = false);
						} else {
							mesh.material.depthTest = false;
						}
					}
				});
			}

			this.inventoryMenuObject = this.object.clone();
			this.inventoryMenuObject.scale.set(0.5, 0.5, 0.5);

			if (this.itemType === ItemType.WorldItem) {
				this.object.rotation.z = Math.PI / 2;
				this.object.scale.set(0.45, 0.45, 0.45);
			}

			if (this.itemType === ItemType.InventoryItem) {
				this.object.scale.set(1.4, 1.4, 1.4);
			}
		});
	}

	public override onFrame(input: HeldItemInput, selectedIndex: number) {
		if (!this.object) return;
		const deltaTime = this.clock.getDelta();
		this.timeAccum += deltaTime;
		this.angleAccum += deltaTime;

		if (this.itemType === ItemType.WorldItem) {
			this.worldOnFrame(deltaTime);
		} else if (this.itemType === ItemType.InventoryItem) {
			this.inventoryOnFrame(deltaTime, selectedIndex);
			this.handOnFrame(deltaTime, input);
		}
	}

	public override inventoryOnFrame(deltaTime: number, selectedIndex: number) {
		if (!this.addedToInventoryItemScenes) {
			this.inventoryMenuScene.add(this.inventoryMenuObject);
			this.addedToInventoryItemScenes = true;
		}

		this.angleAccum += deltaTime;
		this.inventoryMenuObject.position.set(0, this.index, 0);

		const targetQuaternion = inventoryQuaternionBase.clone();
		if (this.index === selectedIndex) {
			rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(0, 1, 0), this.angleAccum * 4);
			this.showInHand();
		} else {
			this.hideInHand();
		}
		this.inventoryMenuObject.quaternion.slerp(targetQuaternion, 0.1 * 60 * deltaTime);
	}

	public override handOnFrame(deltaTime: number, input: HeldItemInput) {
		if (!this.object) return;

		if (this.shownInHand && !this.addedToHandScene) {
			this.scene.add(this.object);
			this.addedToHandScene = true;
		}

		if (this.shownInHand && Date.now() / 1000 - this.shownInHandTimestamp > showInHandDelay) {
			this.handleInput(input, deltaTime);
		} else {
			this.handPosition.lerp(hiddenPosition, 0.1 * 60 * deltaTime);
			this.object.position.copy(this.handPosition);
			// Remove the object after it has slid out of view
			if (this.handPosition.distanceTo(hiddenPosition) < 0.1) {
				if (this.addedToHandScene) {
					this.scene.remove(this.object);
					this.addedToHandScene = false;
				}
			}
		}

		// Update crosshair flashing based on last shot timestamp
		this.renderer.crosshairIsFlashing = Date.now() / 1000 - this.renderer.lastShotSomeoneTimestamp < 0.05;
	}

	private handleInput(input: HeldItemInput, deltaTime: number) {
		if (input.leftClick && (!this.lastInput.leftClick || Date.now() / 1000 - this.lastFired > firingDelayHeld)) {
			if (Date.now() / 1000 - this.lastFired > firingDelay) {
				this.lastFired = Date.now() / 1000;
				this.hitWithPipe();
			}
		}

		if (Date.now() / 1000 - this.lastFired > .38) {
			moveTowardsPos(this.handPosition, unscopedPosition, 0.1 * deltaTime * 60);
			moveTowardsRot(this.object.quaternion, scopedQuaternion, 0.1 * deltaTime * 60);
		} else if (Date.now() / 1000 - this.lastFired < .10) {
			moveTowardsPos(this.handPosition, unscopedPosition, 0.1 * deltaTime * 60);
			moveTowardsRot(this.object.quaternion, windBackQuaternion, 0.1 * deltaTime * 60);
		} else {
			moveTowardsPos(
				this.handPosition,
				hitPosition,
				Math.min(0.4 * Math.pow(Date.now() / 1000 - this.lastFired, 2) * 60, 1),
			);
			moveTowardsRot(
				this.object.quaternion,
				hitQuaternion,
				Math.min(0.4 * Math.pow(Date.now() / 1000 - this.lastFired, 2) * 60, 1),
			);
		}

		this.object.position.copy(this.handPosition);

		this.lastInput = input;
	}

	private hitWithPipe() {
		const totalShots = 25;
		let processedShots = 0;
		const hitPlayers: number[] = [];
		const TIMEOUT = 150;

		const processShots = (deadline?: IdleDeadline) => {
			const timeRemaining = deadline ? deadline.timeRemaining() : 16;

			while (processedShots < totalShots && timeRemaining > 0) {
				const shotVectors = this.renderer.getShotVectorsToPlayersWithOffset(
					(Math.random() - 0.5) * 1.30,
					(Math.random() - 0.5) * 0.80,
					.7,
				);
				if (shotVectors.length > 0) {
					for (const shot of shotVectors) {
						const { playerID, hitPoint } = shot;
						if (!hitPlayers.includes(playerID)) {
							hitPlayers.push(playerID);
							this.networking.applyDamage(playerID, 50);
							this.renderer.playerHitMarkers.push({
								hitPoint: hitPoint,
								shotVector: shot.vector,
								timestamp: -1,
							});
						}
					}
					this.renderer.lastShotSomeoneTimestamp = Date.now() / 1000;
				}
				processedShots++;
			}

			// If we still have shots to process, schedule the next batch
			if (processedShots < totalShots) {
				if (typeof requestIdleCallback === 'function') {
					const idleCallbackId = requestIdleCallback(processShots, { timeout: TIMEOUT });

					// Ensure completion within timeout
					setTimeout(() => {
						cancelIdleCallback(idleCallbackId);
						processShots();
					}, TIMEOUT);
				} else {
					setTimeout(() => processShots(), 0);
				}
			}
		};

		// Initial call
		if (typeof requestIdleCallback === 'function') {
			const idleCallbackId = requestIdleCallback(processShots, { timeout: TIMEOUT });

			// Ensure first batch starts within timeout
			setTimeout(() => {
				cancelIdleCallback(idleCallbackId);
				processShots();
			}, TIMEOUT);
		} else {
			setTimeout(() => processShots(), 0);
		}
	}

	// Method to set world position when used as WorldItem
	public override setWorldPosition(vector: THREE.Vector3) {
		super.setWorldPosition(vector);
	}
}

function rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
	const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
	source.multiplyQuaternions(rotationQuat, source);
}

function moveTowardsPos(source: THREE.Vector3, target: THREE.Vector3, frac: number) {
	source.lerp(target, frac);
}

function moveTowardsRot(source: THREE.Quaternion, target: THREE.Quaternion, frac: number) {
	source.slerp(target, frac);
}
