import * as THREE from 'three';
import { Renderer } from './Renderer.ts';
import { InputHandler } from '../input/InputHandler.ts';
import { BananaGun } from '../items/BananaGun.ts';
import { HeldItemInput } from '../input/HeldItemInput.ts';
import { Networking } from './Networking.ts';
import { ItemBase, ItemType } from '../items/ItemBase.ts';
import { FishGun } from '../items/FishGun.ts';
import { Player } from '../../shared/Player.ts';
import { FlagItem } from '../items/FlagItem.ts';
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
	private lastShootTime: number = 0;

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
		const spectatedPlayer = this.networking.getSpectatedPlayer();
		const currentInventory = spectatedPlayer ? spectatedPlayer.inventory : this.localPlayer.inventory;

		if (!this.arraysEqual(this.oldInventory, currentInventory)) {
			for (let i = this.inventoryItems.length - 1; i >= 0; i--) {
				this.inventoryItems[i].destroy();
				this.inventoryItems.splice(i, 1);
			}

			for (let i = 0; i < currentInventory.length; i++) {
				const num = currentInventory[i];
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
					case 4: {
						const flag = new FlagItem(this.renderer, i, ItemType.InventoryItem);
						this.inventoryItems.push(flag);
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

		this.oldInventory = currentInventory;
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
		const spectatedPlayer = this.networking.getSpectatedPlayer();

		// Handle shooting with tick rate timing
		const currentTime = Date.now() / 1000;
		const tickDuration = 1 / this.networking.getServerInfo().tickRate;
		if (this.inputHandler.getShoot()) {
			this.lastShootTime = currentTime;
		}
		const isShootActive = currentTime - this.lastShootTime < tickDuration;

		// Use spectated player's states if available, otherwise use local states
		const rightClickHeld = spectatedPlayer ? spectatedPlayer.rightClickHeld : this.inputHandler.getAim();
		const shooting = spectatedPlayer ? spectatedPlayer.shooting : isShootActive;
		const heldItemInput = new HeldItemInput(shooting, rightClickHeld, false);

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
					this.lastInventoryTouchTime = currentTime;
					break;
				}
			}
			for (let i = 0; i < nums.length; i++) {
				this.oldNumsPressed[i] = this.inputHandler.getKey(nums[i]);
			}
		}

		if (downPressed || upPressed) this.lastInventoryTouchTime = currentTime;
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
			this.lastInventoryTouchTime = 0;
		}

		if (qPressed && !this.oldQPressed) {
			const temp = this.selectedInventoryItem;
			this.selectedInventoryItem = this.lastSelectedInventoryItem;
			this.lastSelectedInventoryItem = temp;
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

		// Update localPlayer's states
		this.localPlayer.heldItemIndex = this.selectedInventoryItem;
		this.localPlayer.rightClickHeld = this.inputHandler.getAim();
		this.localPlayer.shooting = isShootActive;

		this.cameraY = this.selectedInventoryItem;
		if (currentTime - this.lastInventoryTouchTime > 2) {
			this.cameraX = -1;
		} else {
			this.cameraX = 0;
		}

		this.camera.position.lerp(new THREE.Vector3(this.cameraX, this.selectedInventoryItem, 5), 0.4 * deltaTime * 60);

		const currentSelectedItem = spectatedPlayer ? spectatedPlayer.heldItemIndex : this.selectedInventoryItem;

		for (const item of this.inventoryItems) {
			item.onFrame(heldItemInput, currentSelectedItem);
		}

		this.oldDownPressed = downPressed;
		this.oldUpPressed = upPressed;
		this.oldQPressed = qPressed;
	}
}
