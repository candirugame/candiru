import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { Renderer } from './Renderer.ts';
import { ItemBase, ItemType } from '../items/ItemBase.ts';
import { BananaGun } from '../items/BananaGun.ts';
import { FishGun } from '../items/FishGun.ts';
import { FlagItem } from '../items/FlagItem.ts';

/**
 * Custom types representing the data structure of world items received from the server.
 */
type Vector3Data = {
	x: number;
	y: number;
	z: number;
};

type WorldItemData = {
	id: number;
	itemType: number;
	vector: Vector3Data;
};

type ItemsToRenderEntry = {
	id: number;
	item: ItemBase;
};

/**
 * Handles rendering of remote world items by managing their creation, updates, and removal.
 */
export class RemoteItemRenderer {
	private networking: Networking;
	private renderer: Renderer;
	private itemsToRender: Map<number, ItemBase> = new Map();
	private worldItemsData: WorldItemData[] = [];

	constructor(networking: Networking, renderer: Renderer) {
		this.networking = networking;
		this.renderer = renderer;
	}

	/**
	 * Updates the state of all world items based on the latest data from the server.
	 */
	public update() {
		// Get the latest world items data from networking
		const newWorldItemsData: WorldItemData[] = this.networking.getWorldItemsData();

		// Process the new data to update itemsToRender
		this.updateWorldItems(newWorldItemsData);
	}

	/**
	 * Synchronizes the current items with the new data from the server.
	 * @param newWorldItemsData - Array of world items data received from the server.
	 */
	private updateWorldItems(newWorldItemsData: WorldItemData[]) {
		const newItemsMap: Map<number, WorldItemData> = new Map();
		newWorldItemsData.forEach((item) => newItemsMap.set(item.id, item));

		// Update existing items and add new items
		newWorldItemsData.forEach((worldItemData) => {
			const existingItem = this.itemsToRender.get(worldItemData.id);
			if (existingItem) {
				// Update target position for interpolation
				existingItem.setWorldPosition(
					new THREE.Vector3(
						worldItemData.vector.x,
						worldItemData.vector.y,
						worldItemData.vector.z,
					),
				);
			} else {
				// Create new item
				const item = this.createItemByType(worldItemData.itemType);
				if (item) {
					item.setWorldPosition(
						new THREE.Vector3(
							worldItemData.vector.x,
							worldItemData.vector.y,
							worldItemData.vector.z,
						),
					);
					this.itemsToRender.set(worldItemData.id, item);
				}
			}
		});

		// Remove items that are no longer in the newWorldItemsData
		Array.from(this.itemsToRender.keys()).forEach((id) => {
			if (!newItemsMap.has(id)) {
				const item = this.itemsToRender.get(id);
				if (item) {
					item.destroy();
				}
				this.itemsToRender.delete(id);
			}
		});
	}

	/**
	 * Factory method to create items based on their type.
	 * @param itemType - The type identifier of the item.
	 * @returns A new instance of ItemBase or its subclasses.
	 */
	private createItemByType(itemType: number): ItemBase | null {
		switch (itemType) {
			case 1:
				return new BananaGun(
					this.renderer,
					this.networking,
					0,
					ItemType.WorldItem,
				);
			case 2:
				return new FishGun(
					this.renderer,
					this.networking,
					0,
					ItemType.WorldItem,
				);
			case 4:
				return new FlagItem(
					this.renderer,
					0,
					ItemType.WorldItem,
				);
			default:
				// Return a generic item
				return new ItemBase(
					ItemType.WorldItem,
					this.renderer.getEntityScene(),
					this.renderer.getInventoryMenuScene(),
					0,
				);
		}
	}

	/**
	 * Called every frame to update all rendered items.
	 */
	public onFrame() {
		this.update();
		this.itemsToRender.forEach((item) => {
			item.onFrame(undefined, undefined); // Passing undefined for input and selectedIndex
		});
	}
}
