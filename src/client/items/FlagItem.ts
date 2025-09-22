import { ItemBase, ItemType } from './ItemBase.ts';
import { HeldItemInput } from '../input/HeldItemInput.ts';
import * as THREE from 'three';
import { Renderer } from '../core/Renderer.ts';
import { AssetManager } from '../core/AssetManager.ts';

const showInHandDelay = 0.1;

const scopedPosition = new THREE.Vector3(0, -0.6, 3.5);
const unscopedPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.7, 3.2);
const scopedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.5, 0, 'XYZ'));
const inventoryQuaternionBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.5, 0, 'XYZ'));

export class FlagItem extends ItemBase {
	private renderer!: Renderer;
	private addedToHandScene: boolean;

	// deno-lint-ignore constructor-super
	constructor(renderer: Renderer, index: number, itemType: ItemType, localPlayerId?: number) {
		if (itemType === ItemType.WorldItem) {
			super(
				itemType,
				renderer.getEntityScene(),
				renderer.getInventoryMenuScene(),
				index,
				undefined,
				undefined,
				localPlayerId,
			);
		} else {
			super(
				itemType,
				renderer.getHeldItemScene(),
				renderer.getInventoryMenuScene(),
				index,
				undefined,
				undefined,
				localPlayerId,
			);
		}
		this.renderer = renderer;
		this.addedToHandScene = false;
	}

	public override init() {
		AssetManager.getInstance().loadAsset('models/simplified_pizza.glb', (scene) => {
			this.object = scene;
			if (this.itemType === ItemType.InventoryItem) {
				this.object.traverse((child: THREE.Object3D) => {
					if ((child as THREE.Mesh).isMesh) {
						child.renderOrder = 999;
						const mesh = child as THREE.Mesh;
						if (Array.isArray(mesh.material)) {
							mesh.material.forEach((mat: THREE.Material) => mat.depthTest = false);
						} else {
							mesh.material.depthTest = false;
						}
					}
				});

				this.inventoryMenuObject = this.object.clone();
				this.inventoryMenuObject.scale.set(0.8, 0.8, 0.8);
				this.inventoryMenuObject.rotation.x += Math.PI / 2;
			}

			if (this.itemType === ItemType.WorldItem) {
				this.object.scale.set(0.66, 0.66, 0.66);
			}

			if (this.itemType === ItemType.WorldItem) {
				this.object.scale.set(0.45, 0.45, 0.45);
				this.object.rotation.z -= Math.PI / 2;
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

	// No need to override worldOnFrame if default behavior is sufficient
	// If specific behavior is needed, you can override it here

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
		if (input.rightClick) {
			moveTowardsPos(this.handPosition, scopedPosition, 0.3 * deltaTime * 60);
		} else {
			moveTowardsPos(this.handPosition, unscopedPosition, 0.1 * deltaTime * 60);
		}

		this.object.position.copy(this.handPosition);

		moveTowardsRot(this.object.quaternion, scopedQuaternion, 0.1 * deltaTime * 60);
	}

	public override showInHand() {
		if (this.shownInHand) return;
		this.shownInHand = true;
		this.shownInHandTimestamp = Date.now() / 1000;
		if (!this.addedToHandScene && this.object) {
			this.scene.add(this.object);
			this.addedToHandScene = true;
		}
	}

	public override hideInHand() {
		if (!this.shownInHand) return;
		this.shownInHand = false;
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
