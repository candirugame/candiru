import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { Renderer } from './Renderer.ts';
import { ItemBase, ItemType } from '../items/ItemBase.ts';
import { BananaGun } from '../items/BananaGun.ts';
import { FishGun } from '../items/FishGun.ts';
import { Pipe } from '../items/Pipe.ts';
import { FlagItem } from '../items/FlagItem.ts';
import { ShotHandler } from './ShotHandler.ts';

// Custom types
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

export class RemoteItemRenderer {
	private shotHandler: ShotHandler;
	private networking: Networking;
	private renderer: Renderer;
	private itemsToRender: ItemsToRenderEntry[] = [];

	constructor(networking: Networking, renderer: Renderer, shotHandler: ShotHandler) {
		this.networking = networking;
		this.renderer = renderer;
		this.shotHandler = shotHandler;
	}

	public update() {
		// Get the latest world items data from networking
		const newWorldItemsData: WorldItemData[] = this.networking.getWorldItemsData();

		// Process the new data to update itemsToRender
		this.updateWorldItems(newWorldItemsData);
	}

	private updateWorldItems(newWorldItemsData: WorldItemData[]) {
		// Update existing items and add new items
		newWorldItemsData.forEach((worldItemData) => {
			const existingItem = this.itemsToRender.find((item) => item.id === worldItemData.id);
			if (existingItem) {
				// Update position
				existingItem.item.setWorldPosition(
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
					this.itemsToRender.push({ id: worldItemData.id, item });
				}
			}
		});

		// Remove items that are no longer in the newWorldItemsData
		this.itemsToRender = this.itemsToRender.filter((item) => {
			const existsInNewData = newWorldItemsData.some((worldItemData) => worldItemData.id === item.id);
			if (!existsInNewData) {
				// Remove item from scene
				item.item.destroy();
			}
			return existsInNewData;
		});
	}

	private createItemByType(itemType: number): ItemBase | null {
		// Create item based on itemType
		switch (itemType) {
			case 1:
				return new BananaGun(this.renderer, this.shotHandler, 0, ItemType.WorldItem);
			case 2:
				return new FishGun(this.renderer, this.shotHandler, 0, ItemType.WorldItem);
			case 3:
				return new Pipe(this.renderer, this.shotHandler, 0, ItemType.WorldItem);
			case 4:
				return new FlagItem(this.renderer, 0, ItemType.WorldItem);
			default:
				// Return a generic item
				console.log('Unknown item type:', itemType);
				return new ItemBase(
					ItemType.WorldItem,
					this.renderer.getEntityScene(),
					this.renderer.getInventoryMenuScene(),
					0,
				);
		}
	}

	public onFrame() {
		this.update();
		this.itemsToRender.forEach((itemEntry) => {
			itemEntry.item.onFrame(undefined, undefined); // Passing null for input and selectedIndex
		});
	}

	public destroy() {
		this.itemsToRender.forEach((itemEntry) => {
			itemEntry.item.destroy();
		});
		this.itemsToRender = [];
	}
}
