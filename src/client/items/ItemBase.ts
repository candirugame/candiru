import { HeldItemInput } from '../input/HeldItemInput.ts';
import * as THREE from 'three';

const showInHandDelay = 0.1;

/**
 * Enum representing item types.
 */
export enum ItemType {
	WorldItem = 1,
	InventoryItem = 2,
}

/**
 * Rotates a quaternion around a given axis by a specified angle.
 * @param source - The source quaternion.
 * @param axis - The axis to rotate around.
 * @param angle - The angle in radians.
 */
function rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
	const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
	source.multiplyQuaternions(rotationQuat, source);
}

/**
 * Base class for all items.
 */
export class ItemBase {
	protected timeAccum: number = 0;
	protected clock: THREE.Clock = new THREE.Clock();

	protected object!: THREE.Object3D;
	protected itemType: ItemType;

	protected scene: THREE.Scene; // The scene to put the item in

	protected inventoryMenuScene: THREE.Scene; // Inventory menu scene
	protected inventoryMenuObject!: THREE.Object3D; // The object shown in the inventory menu (he do spin)
	protected index: number; // The index of the item in the inventory
	protected shownInHand: boolean = false;
	protected angleAccum: number = 0;
	protected handPosition: THREE.Vector3 = new THREE.Vector3(0.85, -0.8, 3.2);
	protected shownInHandTimestamp: number = 0;

	// Interpolation properties for WorldItems
	protected currentPosition: THREE.Vector3 = new THREE.Vector3();
	protected targetPosition: THREE.Vector3 = new THREE.Vector3();
	protected lerpSpeed: number = 5; // Adjust for faster/slower interpolation

	constructor(itemType: ItemType, scene: THREE.Scene, inventoryMenuScene: THREE.Scene, index: number) {
		this.itemType = itemType;
		this.scene = scene;
		this.inventoryMenuScene = inventoryMenuScene;
		this.index = index;

		this.init();
	}

	/**
	 * Initializes the item by creating its visual representation.
	 */
	protected init() {
		// Init should be responsible for creating object and inventoryMenuObject
		// For this class, we'll just create a simple cube
		const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
		const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
		this.object = new THREE.Mesh(geometry, material);
		this.inventoryMenuObject = this.object.clone();

		if (this.itemType === ItemType.InventoryItem) {
			this.object.traverse((child) => {
				if ((child as THREE.Mesh).isMesh) {
					child.renderOrder = 999;
					const applyDepthTest = (material: THREE.Material | THREE.Material[]) => {
						if (Array.isArray(material)) {
							material.forEach((mat) => applyDepthTest(mat)); // Recursively handle array elements
						} else {
							material.depthTest = false;
						}
					};
					const mesh = child as THREE.Mesh;
					applyDepthTest(mesh.material);
				}
			});
		}
	}

	/**
	 * Called every frame to update the item's state.
	 * @param input - Input data if the item is held.
	 * @param selectedIndex - The index of the selected item if applicable.
	 */
	onFrame(input: HeldItemInput | undefined, selectedIndex: number | undefined) {
		if (!this.object) return; // Return if object hasn't loaded
		const deltaTime = this.clock.getDelta();
		this.timeAccum += deltaTime;

		if (this.itemType === ItemType.WorldItem) {
			this.worldOnFrame(deltaTime);
		}
		if (this.itemType === ItemType.InventoryItem && selectedIndex !== undefined && input !== undefined) {
			this.inventoryOnFrame(deltaTime, selectedIndex);
			this.handOnFrame(deltaTime, input);
		}
	}

	/** -- World Items -- */
	protected addedToWorldScene: boolean = false;

	/**
	 * Updates the item's position smoothly by interpolating towards the target position.
	 * @param deltaTime - Time elapsed since the last frame.
	 */
	protected worldOnFrame(deltaTime: number) { // This function is called every frame for world items
		if (!this.addedToWorldScene) {
			this.scene.add(this.object);
			this.addedToWorldScene = true;
			this.currentPosition.copy(this.targetPosition); // Initialize current position
		}

		// Lerp current position towards target position
		this.currentPosition.lerp(this.targetPosition, this.lerpSpeed * deltaTime);
		this.object.position.copy(this.currentPosition);

		// Optional: Add some oscillation for visual effect
		this.object.position.add(new THREE.Vector3(0, Math.sin(this.timeAccum * 2) * 0.1, 0));

		// Rotate the object for visual effect
		this.object.rotation.y += deltaTime * 2;
	}

	/**
	 * Sets the target world position for the item.
	 * @param vector - The new target position.
	 */
	setWorldPosition(vector: THREE.Vector3) {
		this.targetPosition.copy(vector);
	}

	/** -- Inventory Items -- */
	protected addedToInventoryItemScenes: boolean = false;

	protected inventoryOnFrame(deltaTime: number, selectedIndex: number) {
		if (!this.addedToInventoryItemScenes) {
			this.scene.add(this.object);
			this.inventoryMenuScene.add(this.inventoryMenuObject);
		}
		this.angleAccum += deltaTime;
		this.inventoryMenuObject.position.set(0, this.index, 0);

		const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
		if (this.index === selectedIndex) {
			rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(0, 1, 0), this.angleAccum * 6);
			this.showInHand();
		} else {
			this.hideInHand();
		}
		rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(1, 0, 0), Math.PI / 4);
		this.inventoryMenuObject.quaternion.slerp(targetQuaternion, 0.1 * 60 * deltaTime);
	}

	protected handOnFrame(deltaTime: number, input: HeldItemInput) {
		if (this.shownInHand && Date.now() / 1000 - this.shownInHandTimestamp > showInHandDelay) {
			this.handPosition.lerp(heldPosition, 0.1 * 60 * deltaTime);
		} else {
			this.handPosition.lerp(hiddenPosition, 0.1 * 60 * deltaTime);
		}

		this.object.position.copy(this.handPosition);
		if (this.shownInHand && input.leftClick) {
			this.object.position.add(new THREE.Vector3(Math.random() * 0.2, Math.random() * 0.2, Math.random() * 0.2));
			this.object.quaternion.slerp(new THREE.Quaternion().random(), 0.1);
		}
	}

	protected showInHand() {
		if (this.shownInHand) return;
		this.shownInHand = true;
		this.shownInHandTimestamp = Date.now() / 1000;
	}

	protected hideInHand() {
		if (!this.shownInHand) return;
		this.shownInHand = false;
	}

	/**
	 * Destroys the item by removing it from all scenes.
	 */
	public destroy() {
		this.scene.remove(this.object);
		this.inventoryMenuScene.remove(this.inventoryMenuObject);
	}
}

const heldPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.5, 3.2);
