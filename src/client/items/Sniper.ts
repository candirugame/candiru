import { ItemBase, ItemType } from './ItemBase.ts';
import { HeldItemInput } from '../input/HeldItemInput.ts';
import * as THREE from 'three';
import { Renderer } from '../core/Renderer.ts';
import { AssetManager } from '../core/AssetManager.ts';
import { ShotHandler, ShotParticleType } from '../core/ShotHandler.ts';

const firingDelay = 0.5;
const firingDelayHeld = 0.5; //longer firing delay when mouse is held down
const showInHandDelay = 0.1;
const timeToFullPower = 8;

const scopedPosition = new THREE.Vector3(0, 0, 4.2);
const unscopedPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.7, 3.2);
const scopedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const unscopedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));

const inventoryQuaternionBase = new THREE.Quaternion(0, 0, 0, 1);

export class Sniper extends ItemBase {
	private shotHandler: ShotHandler;
	private lastInput: HeldItemInput;
	private lastFired: number;
	private addedToHandScene: boolean;
	private renderer: Renderer;

	// deno-lint-ignore constructor-super
	constructor(renderer: Renderer, shotHandler: ShotHandler, index: number, itemType: ItemType) {
		if (itemType === ItemType.WorldItem) {
			super(itemType, renderer.getEntityScene(), renderer.getInventoryMenuScene(), index);
		} else {
			super(itemType, renderer.getHeldItemScene(), renderer.getInventoryMenuScene(), index);
		}
		this.powerStartTimestamp = 0;
		this.shotHandler = shotHandler;
		this.lastInput = new HeldItemInput();
		this.addedToHandScene = false;
		this.lastFired = 0;
		this.renderer = renderer;
	}

	public override init() {
		AssetManager.getInstance().loadAsset('models/simplified_bottle.glb', (scene) => {
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
			}

			this.inventoryMenuObject = this.object.clone();
			this.inventoryMenuObject.scale.set(0.6, 0.6, 0.6);

			if (this.itemType === ItemType.WorldItem) {
				this.object.scale.set(0.45, 0.45, 0.45);
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
			this.renderer.setScopeOffset(this.handPosition.clone().sub(scopedPosition));
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
	}

	private powerStartTimestamp: number;

	private handleInput(input: HeldItemInput, deltaTime: number) {
		if (input.rightClick) {
			moveTowardsPos(this.handPosition, scopedPosition, 0.3 * deltaTime * 60);
			moveTowardsRot(this.object.quaternion, scopedQuaternion, 0.3 * deltaTime * 60);
			if (!this.lastInput.rightClick) this.powerStartTimestamp = Date.now() / 1000;
		} else {
			moveTowardsPos(this.handPosition, unscopedPosition, 0.1 * deltaTime * 60);
			moveTowardsRot(this.object.quaternion, unscopedQuaternion, 0.1 * deltaTime * 60);
		}

		const distToScoped = this.handPosition.distanceTo(scopedPosition);

		const fullyScoped = distToScoped < 0.03 || Date.now() / 1000 - this.lastFired < 0.2; //don't scope out if recently fired
		this.object.visible = !fullyScoped;
		this.renderer.getChatOverlay().sniperOverlayEnabled = fullyScoped;

		const mostlyScoped = distToScoped < 0.08;

		if (mostlyScoped) this.renderer.targetZoom = 8;
		else this.renderer.targetZoom = 1.0;

		this.object.position.copy(this.handPosition);

		const power = Math.min(1, (Date.now() / 1000 - this.powerStartTimestamp) / timeToFullPower);
		this.renderer.getChatOverlay().sniperOverlayPower = power;

		if (
			input.leftClick && mostlyScoped &&
			(!this.lastInput.leftClick || Date.now() / 1000 - this.lastFired > firingDelayHeld)
		) {
			if (Date.now() / 1000 - this.lastFired > firingDelay) {
				this.lastFired = Date.now() / 1000;
				this.shootBanana(power);
				this.powerStartTimestamp = Date.now() / 1000;

				//this.handPosition.add(new THREE.Vector3(0, 0, 0.3));
				rotateAroundWorldAxis(this.object.quaternion, new THREE.Vector3(1, 0, 0), Math.PI / 16);
			}
		}

		this.lastInput = input;
	}

	public override showInHand() {
		if (this.shownInHand) return;
		this.shownInHand = true;
		this.powerStartTimestamp = Date.now() / 1000;
		this.shownInHandTimestamp = Date.now() / 1000;
		if (!this.addedToHandScene && this.object) {
			this.scene.add(this.object);
			this.addedToHandScene = true;
		}
	}

	public override hideInHand() {
		if (!this.shownInHand) return;
		this.shownInHand = false;
		this.renderer.targetZoom = 1.0;
		this.renderer.getChatOverlay().sniperOverlayEnabled = false;
	}
	public itemDepleted(): boolean {
		return false;
	}

	public override destroy() {
		this.renderer.targetZoom = 1.0;
		this.renderer.getChatOverlay().sniperOverlayEnabled = false;
		super.destroy();
	}

	private shootBanana(power: number) {
		// Get the current muzzle position and direction from the renderer
		const muzzlePos = this.renderer.getMuzzlePosition();
		const muzzleDir = this.renderer.getMuzzleDirection();

		this.shotHandler.addShotGroup(
			100 * power,
			1,
			150,
			0,
			0,
			Infinity,
			false,
			ShotParticleType.Sniper,
			muzzlePos,
			muzzleDir,
			true,
		);
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
