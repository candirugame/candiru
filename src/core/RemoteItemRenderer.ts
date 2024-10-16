import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { Renderer } from './Renderer.ts';
import { ItemBase, ItemType } from '../items/ItemBase.ts';
import { BananaGun } from '../items/BananaGun.ts';

export class RemoteItemRenderer {
    private networking: Networking;
    private renderer: Renderer;
    private itemsToRender: { id: number, item: ItemBase }[] = [];
    private worldItemsData= [];

    constructor(networking: Networking, renderer: Renderer) {
        this.networking = networking;
        this.renderer = renderer;
    }

    public update() {
        // Get the latest world items data from networking
        const newWorldItemsData = this.networking.getWorldItemsData();

        // Process the new data to update itemsToRender
        this.updateWorldItems(newWorldItemsData);
    }

    private updateWorldItems(newWorldItemsData) {
        // Update existing items and add new items
        newWorldItemsData.forEach((worldItemData) => {
            const existingItem = this.itemsToRender.find(item => item.id === worldItemData.id);
            if (existingItem) {
                // Update position
                existingItem.item.setWorldPosition(new THREE.Vector3(
                    worldItemData.vector.x,
                    worldItemData.vector.y,
                    worldItemData.vector.z
                ));
            } else {
                // Create new item
                const item = this.createItemByType(worldItemData.itemType);
                if (item) {
                    item.setWorldPosition(new THREE.Vector3(
                        worldItemData.vector.x,
                        worldItemData.vector.y,
                        worldItemData.vector.z
                    ));
                    this.itemsToRender.push({ id: worldItemData.id, item });
                }
            }
        });

        // Remove items that are no longer in the newWorldItemsData
        this.itemsToRender = this.itemsToRender.filter(item => {
            const existsInNewData = newWorldItemsData.some(worldItemData => worldItemData.id === item.id);
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
                return new BananaGun(this.renderer, this.networking, 0, ItemType.WorldItem);
            default:
                // Return a generic item
                return new ItemBase(ItemType.WorldItem, this.renderer.getEntityScene(), this.renderer.getInventoryMenuScene(), 0);
        }
    }

    public onFrame() {
        this.update();
        this.itemsToRender.forEach(itemEntry => {
            itemEntry.item.onFrame(null, null); // Passing null for input and selectedIndex
        });
    }
}