import { WorldItem } from '../models/WorldItem.ts';
import { Player } from '../models/Player.ts';
import { MapData } from '../models/MapData.ts';
import { Vector3 } from '../models/Vector3.ts';
import config from "../config.ts";
import {PlayerManager} from "./PlayerManager.ts";
import {ChatManager} from "./ChatManager.ts";


export class ItemManager {
    private worldItems: WorldItem[] = [];
    private lastItemCreationTimestamp: number = Date.now() / 1000;
    private itemUpdateFlag: boolean = false;

    constructor(private mapData: MapData, private playerManager:PlayerManager, private chatManager:ChatManager) {}

    tick(currentTime: number) {
        this.checkForPickups();
        if (currentTime - this.lastItemCreationTimestamp > config.items.respawnTime) {
            this.createItem();
            this.lastItemCreationTimestamp = currentTime;
        }
        // Additional item-related logic can be added here
    }

    createItem() {
        if (!this.mapData) return;

        const randomIndex = Math.floor(Math.random() * this.mapData.itemRespawnPoints.length);
        const respawnPoint = this.mapData.itemRespawnPoints[randomIndex];
        const newItem = new WorldItem(
            new Vector3(respawnPoint.position.x, respawnPoint.position.y, respawnPoint.position.z),
            respawnPoint.itemId
        );

        if (this.isItemCloseToPoint(newItem.vector, 1)) return; // Another item is too close
        if (this.worldItems.length >= config.items.maxItemsInWorld) return; // Max items reached

        this.worldItems.push(newItem);
        this.itemUpdateFlag = true;
    }

    checkForPickups() {
        // This function would require access to PlayerManager and ChatManager
        // To keep it decoupled, consider using event emitters or passing necessary references
        // For simplicity, it's left as a stub here
    }

    isItemCloseToPoint(vector: Vector3, distance: number): boolean {
        return this.worldItems.some(item => item.vector.distanceTo(vector) < distance);
    }

    getAllItems(): WorldItem[] {
        return this.worldItems;
    }

    removeItem(itemId: number) {
        this.worldItems = this.worldItems.filter(item => item.id !== itemId);
        this.itemUpdateFlag = true;
    }

    hasUpdates(): boolean {
        if (this.itemUpdateFlag) {
            this.itemUpdateFlag = false;
            return true;
        }
        return false;
    }
}