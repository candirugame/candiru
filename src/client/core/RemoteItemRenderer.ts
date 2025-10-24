import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { Renderer } from './Renderer.ts';
import { ItemBase, ItemType } from '../items/ItemBase.ts';
import { BananaGun } from '../items/BananaGun.ts';
import { FishGun } from '../items/FishGun.ts';
import { Pipe } from '../items/Pipe.ts';
import { FlagItem } from '../items/FlagItem.ts';
import { ShotHandler } from './ShotHandler.ts';
import { Sniper } from '../items/Sniper.ts';
import { Trajectory } from '../input/Trajectory.ts';

// Custom types
type Vector3Data = {
	x: number;
	y: number;
	z: number;
};

type TrajectoryHitData = {
	point: Vector3Data;
	normal: Vector3Data;
	index: number;
};

type TrajectoryData = {
	points: Vector3Data[];
	dt: number;
	hits: TrajectoryHitData[];
};

type WorldItemData = {
	id: number;
	itemType: number;
	vector: Vector3Data;
	initTrajectory?: TrajectoryData;
	playerIdsTrajectoryHiddenFrom?: number[];
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
				const decodedTrajectory = worldItemData.initTrajectory
					? this.decodeTrajectory(worldItemData.initTrajectory)
					: undefined;
				const item = this.createItemByType(
					worldItemData.itemType,
					decodedTrajectory,
					worldItemData.playerIdsTrajectoryHiddenFrom,
				);
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
			const createdOnClient = item.id > 1000000000; // Assuming server IDs are below this threshold
			const trajectoryDuration = item.item.getTrajectoryDuration();
			const createdRecently = trajectoryDuration !== undefined &&
				(Date.now() / 1000 - item.item.getCreationTimestamp() <
					trajectoryDuration + this.renderer.getLatency() / 1000 * 1.2 + 0.15);

			const shouldKeep = existsInNewData || (createdOnClient && createdRecently);
			if (!shouldKeep) item.item.destroy();

			return shouldKeep;
		});
	}

	//when playerIdsTrajectoryHiddenFrom = [-1], only show the trajectory then remove the item
	private createItemByType(
		itemType: number,
		trajectory: Trajectory | undefined,
		playerIdsTrajectoryHiddenFrom?: number[],
	): ItemBase | null {
		const localPlayerId = this.networking.getLocalPlayer ? this.networking.getLocalPlayer().id : undefined;
		// Create item based on itemType

		switch (itemType) {
			case 1:
				return new BananaGun(
					this.renderer,
					this.shotHandler,
					0,
					ItemType.WorldItem,
					trajectory,
					playerIdsTrajectoryHiddenFrom,
					localPlayerId,
				);
			case 2:
				return new FishGun(
					this.renderer,
					this.shotHandler,
					0,
					ItemType.WorldItem,
					trajectory,
					playerIdsTrajectoryHiddenFrom,
					localPlayerId,
				);
			case 3:
				return new Pipe(
					this.renderer,
					this.shotHandler,
					0,
					ItemType.WorldItem,
					trajectory,
					playerIdsTrajectoryHiddenFrom,
					localPlayerId,
				);
			case 4:
				return new FlagItem(this.renderer, 0, ItemType.WorldItem, localPlayerId);
			case 5:
				return new Sniper(
					this.renderer,
					this.shotHandler,
					0,
					ItemType.WorldItem,
					trajectory,
					playerIdsTrajectoryHiddenFrom,
					localPlayerId,
				);
			default:
				// Return a generic item
				console.log('Unknown item type:', itemType);
				return new ItemBase(
					ItemType.WorldItem,
					this.renderer.getEntityScene(),
					this.renderer.getInventoryMenuScene(),
					0,
					trajectory,
					playerIdsTrajectoryHiddenFrom,
					localPlayerId,
				);
		}
	}

	private decodeTrajectory(data: TrajectoryData): Trajectory {
		const points = data.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
		const hits = data.hits.map((h) => ({
			point: new THREE.Vector3(h.point.x, h.point.y, h.point.z),
			normal: new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z),
			index: h.index,
		}));
		return new Trajectory(points, data.dt, hits);
	}

	public onFrame() {
		this.update();
		// Process any locally thrown items queued by Renderer this frame
		// Access pending thrown items via Renderer public API (if available)
		let pending: { itemType: number; trajectory: Trajectory }[] = [];

		pending = (this.renderer as Renderer & {
			getAndClearPendingThrownItems: () => { itemType: number; trajectory: Trajectory }[];
		}).getAndClearPendingThrownItems();

		if (pending.length > 0) {
			pending.forEach((entry) => {
				// create a temporary ID using timestamp + random to avoid collisions until server authoritative data arrives
				const tempId = Date.now() + Math.floor(1000000000 + Math.random() * 100000);
				const item = this.createItemByType(entry.itemType, entry.trajectory, undefined);
				if (item) {
					// Position item at first trajectory point if available
					if (entry.trajectory.points.length > 0) {
						item.setWorldPosition(entry.trajectory.points[entry.trajectory.points.length - 1].clone());
					}
					this.itemsToRender.push({ id: tempId, item });
				}
			});
		}
		this.itemsToRender.forEach((itemEntry) => {
			itemEntry.item.onFrame(undefined, undefined); // Passing null for input and selectedIndex
		});
		//check each item to see if its trajectory is finished and playerIdsTrajectoryHiddenFrom = [-1], then remove the item
	}

	public destroy() {
		this.itemsToRender.forEach((itemEntry) => {
			itemEntry.item.destroy();
		});
		this.itemsToRender = [];
	}
}
