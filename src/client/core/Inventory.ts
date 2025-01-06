import * as THREE from 'three';
import { Renderer } from './Renderer.ts';
import { InputHandler } from '../input/InputHandler.ts';
import { BananaGun } from '../items/BananaGun.ts';
import { HeldItemInput } from '../input/HeldItemInput.ts';
import { Networking } from './Networking.ts';
import { ItemBase, ItemType } from '../items/ItemBase.ts';
import { FishGun } from '../items/FishGun.ts';
import { Player } from '../../shared/Player.ts';

export class Inventory {
	private inventoryItems: ItemBase[] = [];
	private renderer: Renderer;
	private inputHandler: InputHandler;
	private networking: Networking;
	private inventoryScene: THREE.Scene;
	private selectedInventoryItem: number = 0;
	private lastSelectedInventoryItem: number = 0;
	private cameraY: number = 0;
	private cameraX: number = 0;
	private clock: THREE.Clock;
	private camera: THREE.Camera;
	private lastInventoryTouchTime: number = 0;
	private localPlayer: Player;
	private oldInventory: number[] = [];

	private oldDownPressed: boolean = false;
	private oldUpPressed: boolean = false;
	private oldQPressed: boolean = false;
	private oldNumsPressed: boolean[] = new Array(10).fill(false);

	constructor(renderer: Renderer, inputHandler: InputHandler, networking: Networking, localPlayer: Player) {
		this.renderer = renderer;
		this.inputHandler = inputHandler;
		this.networking = networking;
		this.inventoryScene = renderer.getInventoryMenuScene();
		this.clock = new THREE.Clock();
		this.camera = renderer.getInventoryMenuCamera();
		this.localPlayer = localPlayer;
	}

	public init() {
	}

	private updateInventoryItems() {
		if (!this.arraysEqual(this.oldInventory, this.localPlayer.inventory)) {
			for (let i = this.inventoryItems.length - 1; i >= 0; i--) {
				this.inventoryItems[i].destroy();
				this.inventoryItems.splice(i, 1);
			}

			//iterate through every number in localPlayer.inventory
			for (let i = 0; i < this.localPlayer.inventory.length; i++) {
				const num = this.localPlayer.inventory[i];
				switch (num) {
					case 1: {
						const banana = new BananaGun(this.renderer, this.networking, i, ItemType.InventoryItem);
						this.inventoryItems.push(banana);
						break;
					}
					case 2: {
						const fish = new FishGun(this.renderer, this.networking, i, ItemType.InventoryItem);
						this.inventoryItems.push(fish);
						break;
					}
					default: {
						const testItem = new ItemBase(
							ItemType.InventoryItem,
							this.renderer.getHeldItemScene(),
							this.inventoryScene,
							i,
						);
						this.inventoryItems.push(testItem);
						break;
					}
				}
			}
		}

		this.oldInventory = this.localPlayer.inventory;
	}

	public arraysEqual(a: number[], b: number[]) {
		if (a === b) return true;
		if (a == null || b == null) return false;
		if (a.length != b.length) return false;
		for (let i = 0; i < a.length; ++i) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	public onFrame() {
		this.updateInventoryItems();
		const gamepadInputs = this.inputHandler.getGamepadInputs();
		const heldItemInput = new HeldItemInput(this.inputHandler.getShoot(), this.inputHandler.getAim(), false);
		let downPressed = (this.inputHandler.getKey('[') || this.inputHandler.getInventoryIterationTouched()) &&
			!this.localPlayer.chatActive;
		let upPressed = this.inputHandler.getKey(']') && !this.localPlayer.chatActive;
		const qPressed = this.inputHandler.getKey('q') && !this.localPlayer.chatActive;
		if (gamepadInputs.leftShoulder && !this.localPlayer.chatActive) upPressed = true;
		if (gamepadInputs.rightShoulder && !this.localPlayer.chatActive) downPressed = true;
		const lastScroll = this.inputHandler.getScrollClicks();
		if (lastScroll > 0) upPressed = true;
		if (lastScroll < 0) downPressed = true;

		if (!this.localPlayer.chatActive) {
			const nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
			for (let i = 0; i < nums.length; i++) {
				const numPressed = this.inputHandler.getKey(nums[i]);
				if (numPressed && !this.oldNumsPressed[i]) {
					this.lastSelectedInventoryItem = this.selectedInventoryItem;
					this.selectedInventoryItem = i;
					this.lastInventoryTouchTime = Date.now() / 1000;
					break;
				}
			}

			for (let i = 0; i < nums.length; i++) {
				this.oldNumsPressed[i] = this.inputHandler.getKey(nums[i]);
			}
		}

		if (downPressed || upPressed) this.lastInventoryTouchTime = Date.now() / 1000;
		const deltaTime = this.clock.getDelta();

		if (downPressed && !this.oldDownPressed) {
			this.lastSelectedInventoryItem = this.selectedInventoryItem;
			this.selectedInventoryItem++;
		}
		if (upPressed && !this.oldUpPressed) {
			this.lastSelectedInventoryItem = this.selectedInventoryItem;
			this.selectedInventoryItem--;
		}
		if (this.inputHandler.getKey('enter')) {
			this.lastInventoryTouchTime = 0; //hide inventory
		}

		if (qPressed && !this.oldQPressed) {
			const temp = this.selectedInventoryItem;
			this.selectedInventoryItem = this.lastSelectedInventoryItem;
			this.lastSelectedInventoryItem = temp;
			//this.lastInventoryTouchTime = Date.now() / 1000 - 1.25;
		}

		if (this.selectedInventoryItem < 0) {
			this.selectedInventoryItem = this.inventoryItems.length - 1;
		}
		if (this.selectedInventoryItem >= this.inventoryItems.length) {
			this.selectedInventoryItem = 0;
		}

		if (this.lastSelectedInventoryItem < 0) {
			this.lastSelectedInventoryItem = this.inventoryItems.length - 1;
		}
		if (this.lastSelectedInventoryItem >= this.inventoryItems.length) {
			this.lastSelectedInventoryItem = 0;
		}

		this.cameraY = this.selectedInventoryItem; //might be backwards
		if (Date.now() / 1000 - this.lastInventoryTouchTime > 2) {
			this.cameraX = -1;
		} else {
			this.cameraX = 0;
		}

		this.camera.position.lerp(new THREE.Vector3(this.cameraX, this.selectedInventoryItem, 5), 0.4 * deltaTime * 60);

		for (const item of this.inventoryItems) {
			item.onFrame(heldItemInput, this.selectedInventoryItem);
		}

		this.oldDownPressed = downPressed;
		this.oldUpPressed = upPressed;
		this.oldQPressed = qPressed;
	}
}
