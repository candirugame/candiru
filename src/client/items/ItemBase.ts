import { HeldItemInput } from '../input/HeldItemInput.ts';
import * as THREE from 'three';
import { Trajectory } from '../input/Trajectory.ts';
import { seededRandom } from '../../shared/Utils.ts';

const showInHandDelay = 0.1;

export class ItemBase {
	protected timeAccum: number = 0;
	protected clock: THREE.Clock = new THREE.Clock();

	protected object!: THREE.Object3D;
	protected itemType: ItemType;

	protected initTrajectory?: Trajectory;

	protected playerIdsTrajectoryHiddenFrom?: number[];

	protected localPlayerId?: number;

	protected scene: THREE.Scene; // The scene to put the item in

	protected inventoryMenuScene: THREE.Scene; //Inventory menu scene
	protected inventoryMenuObject!: THREE.Object3D; //The object shown in the inventory menu (he do spin)
	protected index: number; //The index of the item in the inventory
	protected shownInHand: boolean = false;
	protected angleAccum: number = 0;
	protected handPosition: THREE.Vector3 = new THREE.Vector3(0.85, -0.8, 3.2);
	protected shownInHandTimestamp: number = 0;
	protected creationTimestamp: number;

	constructor(
		itemType: ItemType,
		scene: THREE.Scene,
		inventoryMenuScene: THREE.Scene,
		index: number,
		initTrajectory?: Trajectory,
		playerIdsTrajectoryHiddenFrom?: number[],
		localPlayerId?: number,
	) {
		this.itemType = itemType;
		this.scene = scene;
		this.inventoryMenuScene = inventoryMenuScene;
		this.index = index;
		this.initTrajectory = initTrajectory;
		this.playerIdsTrajectoryHiddenFrom = playerIdsTrajectoryHiddenFrom;
		this.localPlayerId = localPlayerId;
		this.creationTimestamp = Date.now() / 1000;

		this.init();
	}

	protected init() {
		// Init should be responsible for creating object and inventoryMenuObject
		// For this class, we'll just create a simple cube
		const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
		const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
		this.object = new THREE.Mesh(geometry, material);
		this.inventoryMenuObject = this.object.clone();

		if (this.itemType === ItemType.InventoryItem) {
			this.object.traverse((child: THREE.Object3D) => {
				if ((child as THREE.Mesh).isMesh) {
					child.renderOrder = 999;
					const applyDepthTest = (material: THREE.Material | THREE.Material[]): void => {
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

	onFrame(input: HeldItemInput | undefined, selectedIndex: number | undefined) {
		if (!this.object) return; //return if object hasn't loaded
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
	protected worldPosition: THREE.Vector3 = new THREE.Vector3();

	private trajectoryDuration: number | undefined = undefined; //don't want to derive this for every worldItem every frame

	private trajectorySeed: number | undefined = undefined;

	protected worldOnFrame(deltaTime: number) { // This function is called every frame for world items
		if (!this.addedToWorldScene) {
			this.scene.add(this.object);
			this.addedToWorldScene = true;
		}
		if (this.initTrajectory) {
			if (this.trajectoryDuration === undefined) {
				this.trajectoryDuration = this.initTrajectory.getDuration();

				if (this.initTrajectory.points.length > 0) {
					this.trajectorySeed = seededRandom(
						seededRandom(this.initTrajectory.points[0].x) + seededRandom(this.initTrajectory.points[0].y) +
							seededRandom(this.initTrajectory.points[0].z),
					);
				}

				if (this.trajectorySeed) {
					this.object.rotation.x = seededRandom(this.trajectorySeed) * Math.PI * 2;
					this.object.rotation.y = seededRandom(this.trajectorySeed + 1) * Math.PI * 2;
					this.object.rotation.z = seededRandom(this.trajectorySeed + 2) * Math.PI * 2;
				}

				//console.log('Trajectory duration calculated:', this.trajectoryDuration);
			}
			const timeSinceCreated = Date.now() / 1000 - this.creationTimestamp;
			//	console.log(timeSinceCreated);
			// console.log(Date.now() / 1000, this.creationTimestamp);
			if (timeSinceCreated < this.trajectoryDuration) {
				this.object.position.copy(this.initTrajectory.sample(timeSinceCreated));
				this.object.rotation.x += deltaTime * 4;
				this.object.rotation.y += deltaTime * 4;
				this.object.rotation.z += deltaTime * 4;
				//console.log('Sampling trajectory at time:', timeSinceCreated, this.object.position);
				return;
			} else {
				this.initTrajectory = undefined; //trajectory is done
			}
		}

		this.object.visible = !(this.initTrajectory && this.playerIdsTrajectoryHiddenFrom?.includes(this.localPlayerId)); //hide if trajectory is active and local player is in the hidden list

		// Idle animation
		this.object.position.copy(this.worldPosition);
		// this.object.position.add(new THREE.Vector3(0, Math.sin(this.timeAccum * 2) * 0.1, 0));
		if (this.trajectorySeed) {
			// this.object.rotation.x = seededRandom(this.trajectorySeed + 3) * Math.PI * 2;
			// this.object.rotation.y = seededRandom(this.trajectorySeed + 4) * Math.PI * 2;
			// this.object.rotation.z = seededRandom(this.trajectorySeed + 5) * Math.PI * 2;
		} else {
			this.object.rotation.x = 0;
			this.object.rotation.z = 0;
			this.object.rotation.y += deltaTime * 2;
		}
	}

	setWorldPosition(vector: THREE.Vector3) {
		this.worldPosition = vector;
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

	public destroy() {
		this.scene.remove(this.object);
		this.inventoryMenuScene.remove(this.inventoryMenuObject);
	}
}
const heldPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.5, 3.2);
export enum ItemType {
	//TODO diagnose lint being weird here?
	// eslint-disable-next-line no-unused-vars
	WorldItem = 1,
	// eslint-disable-next-line no-unused-vars
	InventoryItem = 2,
}

function rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
	const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
	source.multiplyQuaternions(rotationQuat, source);
}
