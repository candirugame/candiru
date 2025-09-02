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
		const trajectory: Trajectory = new Trajectory(
			[
				new THREE.Vector3(8.808529195432472, 1.178471585789117, -1.8753859296382918),
				new THREE.Vector3(8.80983952356667, 1.8665932062840318, -1.5478056431973228),
				new THREE.Vector3(8.811149851700867, 2.5026314934456138, -1.2202253567563537),
				new THREE.Vector3(8.812460179835064, 3.086586447273862, -0.8926450703153848),
				new THREE.Vector3(8.81377050796926, 3.6184580677687763, -0.5650647838744158),
				new THREE.Vector3(8.815080836103457, 4.098246354930358, -0.2374844974334469),
				new THREE.Vector3(8.816391164237654, 4.525951308758606, 0.09009578900752224),
				new THREE.Vector3(8.817701492371851, 4.901572929253522, 0.41767607544849117),
				new THREE.Vector3(8.819011820506049, 5.225111216415104, 0.7452563618894605),
				new THREE.Vector3(8.820322148640246, 5.496566170243351, 1.0728366483304295),
				new THREE.Vector3(8.821632476774443, 5.715937790738265, 1.4004169347713984),
				new THREE.Vector3(8.82294280490864, 5.883226077899847, 1.7279972212123673),
				new THREE.Vector3(8.824253133042838, 5.998431031728096, 2.0555775076533362),
				new THREE.Vector3(8.825563461177035, 6.06155265222301, 2.383157794094305),
				new THREE.Vector3(8.82687378931123, 6.072590939384591, 2.710738080535273),
				new THREE.Vector3(8.828184117445428, 6.031545893212841, 3.038318366976242),
				new THREE.Vector3(8.829494445579625, 5.938417513707757, 3.365898653417211),
				new THREE.Vector3(8.830804773713822, 5.7932058008693375, 3.69347893985818),
				new THREE.Vector3(8.83211510184802, 5.595910754697586, 4.021059226299148),
				new THREE.Vector3(8.833425429982217, 5.346532375192503, 4.348639512740117),
				new THREE.Vector3(8.834735758116414, 5.0450706623540835, 4.676219799181085),
				new THREE.Vector3(8.836046086250612, 4.691525616182332, 5.003800085622055),
				new THREE.Vector3(8.837356414384809, 4.285897236677249, 5.331380372063023),
				new THREE.Vector3(8.838666742519004, 3.828185523838833, 5.658960658503991),
				new THREE.Vector3(8.839977070653202, 3.3183904776670765, 5.986540944944961),
				new THREE.Vector3(8.841287398787399, 2.756512098161995, 6.314121231385931),
				new THREE.Vector3(8.842597726921596, 2.142550385323574, 6.641701517826901),
				new THREE.Vector3(8.843908055055794, 1.4765053391518208, 6.969281804267871),
				new THREE.Vector3(8.84521838318999, 0.7583769596467356, 7.296862090708839),
				new THREE.Vector3(8.824685973742566, 0.23826663196086884, 2.1637871054632787),
			],
			0.041666666666666664,
			[
				{
					point: new THREE.Vector3(8.824685973742566, 0.23826663196086884, 2.1637871054632787),
					normal: new THREE.Vector3(0, 1, 0),
					index: 30,
				},
			],
		);

		switch (itemType) {
			case 1:
				return new BananaGun(this.renderer, this.shotHandler, 0, ItemType.WorldItem, trajectory, []);
			case 2:
				return new FishGun(this.renderer, this.shotHandler, 0, ItemType.WorldItem, trajectory, []);
			case 3:
				return new Pipe(this.renderer, this.shotHandler, 0, ItemType.WorldItem, trajectory, []);
			case 4:
				return new FlagItem(this.renderer, 0, ItemType.WorldItem, trajectory, []);
			case 5:
				return new Sniper(this.renderer, this.shotHandler, 0, ItemType.WorldItem, trajectory, []);
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
