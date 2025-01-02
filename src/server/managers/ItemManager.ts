import { WorldItem } from '../models/WorldItem.ts';
import { MapData } from '../models/MapData.ts';
import { Vector3 } from '../models/Vector3.ts';
import config from "../config.ts";
import {PlayerManager} from "./PlayerManager.ts";
import {ChatManager} from "./ChatManager.ts";
import {Gamemode} from "../gamemodes/Gamemode.ts";


export class ItemManager {
    private worldItems: WorldItem[] = [];
    private lastItemCreationTimestamp: number = Date.now() / 1000;
    private itemUpdateFlag: boolean = false;
    private gamemode: Gamemode | false = false;

    constructor(private mapData: MapData, public playerManager:PlayerManager, private chatManager:ChatManager) {}

    public setGamemode(gamemode: Gamemode | false) {this.gamemode = gamemode;}

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

    pushItem(item: WorldItem) {
        this.worldItems.push(item);
        this.itemUpdateFlag = true;
    }

    checkForPickups() {
        const players = this.playerManager.getAllPlayers();

        for (const player of players) {
            if(player.playerSpectating !== -1) continue;
            if(player.health <= 0) continue;
            const itemIndex = this.worldItems.findIndex(item =>
               Vector3.distanceTo(player.position, item.vector) < 0.5
            );

            if (itemIndex === -1) continue;

            const item = this.worldItems[itemIndex];
            let shouldPickup = false;

            switch (item.itemType) {
                case 0: // Cube
                    player.inventory.push(0);
                    shouldPickup = true;
                    this.chatManager.broadcastChat(`${player.name} picked up [Object]!`);
                    console.log(`🍌 ${player.name} picked up cube!`);
                    break;

                case 1: // Banana
                    if (!player.inventory.includes(1)) {
                        player.inventory.push(1);
                        shouldPickup = true;
                        console.log(`🍌 ${player.name} picked up banana!`);
                    }
                    break;

                case 2: // Fish
                    if (!player.inventory.includes(2)) {
                        player.inventory.push(2);
                        shouldPickup = true;
                        console.log(`🍌 ${player.name} picked up fish!`);
                    }
                    break;
            }

            if (shouldPickup) {
                if(this.gamemode) this.gamemode.onItemPickup(player);
                this.worldItems.splice(itemIndex, 1);
                this.itemUpdateFlag = true;
            }
        }
    }


    isItemCloseToPoint(vector: Vector3, distance: number): boolean {
        return this.worldItems.some(item => Vector3.distanceTo(item.vector,vector) < distance);
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

    triggerUpdateFlag(){
        this.itemUpdateFlag = true;
    }
}