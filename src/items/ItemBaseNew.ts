import { HeldItemInput } from '../input/HeldItemInput';
import * as THREE from 'three';



export class ItemBaseNew{
    private timeAccum:number = 0;
    private clock:THREE.Clock = new THREE.Clock();

    private object: THREE.Object3D;
    private itemType: ItemType;

    private scene: THREE.Scene; // The scene to put the item in
    private inventoryMenuScene: THREE.Scene; //Inventory menu scene


    constructor(itemType:ItemType, scene:THREE.Scene, inventoryMenuScene:THREE.Scene) {
        this.itemType = itemType;
        this.scene = scene;
        this.inventoryMenuScene = inventoryMenuScene;

        this.init();
    }

    public init() {
        // Load the object
        // For this class, we'll just create a simple cube
        const geometry = new THREE.BoxGeometry(1,1,1);
        const material = new THREE.MeshBasicMaterial({color: 0x00ff00});
        this.object = new THREE.Mesh(geometry, material);
    }

    public onFrame() {
        if(!this.object) return; //return if object hasn't loaded
        const deltaTime = this.clock.getDelta();
        this.timeAccum += deltaTime;

        if(this.itemType === ItemType.WorldItem)
            this.worldOnFrame(deltaTime);
        if(this.itemType === ItemType.InventoryItem)
            this.inventoryOnFrame();
    }

    /** -- World Items -- */
    private addedToWorldScene:boolean = false;
    private worldPosition:THREE.Vector3 = new THREE.Vector3();


    public worldOnFrame(deltaTime:number){ // This function is called every frame for world items
        if(!this.addedToWorldScene){
            this.scene.add(this.object);
            this.addedToWorldScene = true;
            console.log("Item added to world scene");
        }
        this.object.position.lerp(this.worldPosition,0.1 * deltaTime * 60);
      //  this.object.position.add(new THREE.Vector3(0, Math.sin(this.timeAccum) * 0.5, 0));

    }

    public setWorldPosition(vector:THREE.Vector3){
        this.worldPosition = vector;
    }

    /** -- Inventory Items -- */

    public inventoryOnFrame(){

    }





}
export enum ItemType {
    WorldItem = 1,
    InventoryItem = 2,
}