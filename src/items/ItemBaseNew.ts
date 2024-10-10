import { HeldItemInput } from '../input/HeldItemInput';
import * as THREE from 'three';
import {rotate} from "three/src/nodes/utils/RotateNode";

const showInHandDelay = 0.1;

export class ItemBaseNew{
    private timeAccum:number = 0;
    private clock:THREE.Clock = new THREE.Clock();

    private object: THREE.Object3D;
    private itemType: ItemType;

    private scene: THREE.Scene; // The scene to put the item in

    private inventoryMenuScene: THREE.Scene; //Inventory menu scene
    private inventoryMenuObject:THREE.Object3D; //The object shown in the inventory menu (he do spin)
    private index:number; //The index of the item in the inventory
    private shownInHand:boolean = false;
    private angleAccum: number = 0;
    private handPosition:THREE.Vector3 = new THREE.Vector3(0.85, -0.8, 3.2);
    private shownInHandTimestamp:number = 0;


    constructor(itemType:ItemType, scene:THREE.Scene, inventoryMenuScene:THREE.Scene, index:number){
        this.itemType = itemType;
        this.scene = scene;
        this.inventoryMenuScene = inventoryMenuScene;
        this.index = index;

        this.init();
    }

    public init() {
        // Init should be responsible for creating object and inventoryMenuObject
        // For this class, we'll just create a simple cube
        const geometry = new THREE.BoxGeometry(0.5,0.5,0.5);
        const material = new THREE.MeshBasicMaterial({color: 0x00ff00});
        this.object = new THREE.Mesh(geometry, material);
        this.inventoryMenuObject = this.object.clone();

        if(this.itemType === ItemType.InventoryItem)
            this.object.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.renderOrder = 999;
                    (child as THREE.Mesh).material.depthTest = false;
                }
            });
    }

    public onFrame(input: HeldItemInput, selectedIndex: number) {
        if(!this.object) return; //return if object hasn't loaded
        const deltaTime = this.clock.getDelta();
        this.timeAccum += deltaTime;

        if(this.itemType === ItemType.WorldItem)
            this.worldOnFrame(deltaTime);
        if(this.itemType === ItemType.InventoryItem){
            this.inventoryOnFrame(deltaTime, selectedIndex);
            this.handOnFrame(deltaTime, input);
        }
    }

    /** -- World Items -- */
    private addedToWorldScene:boolean = false;
    private worldPosition:THREE.Vector3 = new THREE.Vector3();


    private worldOnFrame(){ // This function is called every frame for world items
        if(!this.addedToWorldScene){
            this.scene.add(this.object);
            this.addedToWorldScene = true;
        }
        this.object.position.copy(this.worldPosition);
        this.object.position.add(new THREE.Vector3(0, Math.sin(this.timeAccum*2) * 0.1, 0));

    }

    public setWorldPosition(vector:THREE.Vector3){
        this.worldPosition = vector;
    }

    /** -- Inventory Items -- */
    private addedToInventoryItemScenes:boolean = false;

    private inventoryOnFrame(deltaTime:number, selectedIndex:number){
        if(!this.addedToInventoryItemScenes){
            this.scene.add(this.object);
            this.inventoryMenuScene.add(this.inventoryMenuObject);
        }
        this.angleAccum+=deltaTime;
        this.inventoryMenuObject.position.set(0, this.index, 0);

        const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,0));
        if(this.index === selectedIndex){
            rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(0,1,0), this.angleAccum * 6);
            this.showInHand();
        }else{
            this.hideInHand();
        }
        rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(1,0,0), Math.PI / 4);
        this.inventoryMenuObject.quaternion.slerp(targetQuaternion, 0.1 * 60 * deltaTime);
    }

    private handOnFrame(deltaTime:number, input:HeldItemInput){
        if(this.shownInHand && Date.now() / 1000 - this.shownInHandTimestamp > showInHandDelay)
            this.handPosition.lerp(heldPosition, 0.1 * 60 *deltaTime);
        else
            this.handPosition.lerp(hiddenPosition, 0.1 * 60 *deltaTime);

        this.object.position.copy(this.handPosition);
        if(this.shownInHand && input.leftClick){
            this.object.position.add(new THREE.Vector3(Math.random()*0.2, Math.random()*0.2, Math.random()*0.2));
            this.object.quaternion.slerp(new THREE.Quaternion().random(),0.1);
        }
    }

    private showInHand(){
        if(this.shownInHand) return;
        this.shownInHand = true;
        this.shownInHandTimestamp = Date.now() / 1000;

    }

    private hideInHand(){
        if(!this.shownInHand) return;
        this.shownInHand = false;
    }





}
const heldPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.5, 3.2);
export enum ItemType {
    WorldItem = 1,
    InventoryItem = 2,
}

function rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
    const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    source.multiplyQuaternions(rotationQuat, source);
}