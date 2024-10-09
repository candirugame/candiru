import * as THREE from 'three';
import { Renderer } from './Renderer';
import { InputHandler } from '../input/InputHandler';
import { BananaGun } from '../items/BananaGun';
import { HeldItemInput } from '../input/HeldItemInput';
import {Networking} from "./Networking";
import {ItemBase} from "../items/ItemBase";
import {Player} from "./Player";

export class Inventory {
    private inventoryItems: ItemBase[] = [];
    private renderer: Renderer;
    private inputHandler: InputHandler;
    private networking: Networking;
    private inventoryScene: THREE.Scene;
    private selectedInventoryItem: number = 0;
    private cameraY: number = 0;
    private cameraX: number = 0;
    private clock: THREE.Clock;
    private camera: THREE.Camera;
    private lastInventoryTouchTime: number = 0;
    private localPlayer: Player;

    private oldDownPressed: boolean = false;
    private oldUpPressed: boolean = false;

    constructor(renderer: Renderer, inputHandler: InputHandler, networking:Networking, localPlayer:Player) {
        this.renderer = renderer;
        this.inputHandler = inputHandler;
        this.networking = networking;
        this.inventoryScene = renderer.getInventoryMenuScene();
        this.clock = new THREE.Clock();
        this.camera = renderer.getInventoryMenuCamera();
        this.localPlayer = localPlayer;
    }

    public init() {
        const deltaTime = this.clock.getDelta();
        for(const item of this.inventoryItems) {
            item.init();
        }
        const banana = new BananaGun(this.renderer, this.networking, this.inventoryItems.length);
        banana.init();
        this.inventoryItems.push(banana);


    }

    public onFrame() {
        const heldItemInput = new HeldItemInput(this.inputHandler.getLeftMouseDown(), this.inputHandler.getRightMouseDown(), false);
        const downPressed = this.inputHandler.getKey('[') && !this.localPlayer.chatActive;
        const upPressed = this.inputHandler.getKey(']') && !this.localPlayer.chatActive;
        if(!this.localPlayer.chatActive){
            const nums = ['1','2','3','4','5','6','7','8','9','0'];
            for(let i = 0; i < nums.length; i++) {
                if(this.inputHandler.getKey(nums[i])) {
                    this.selectedInventoryItem = i;
                    this.lastInventoryTouchTime = Date.now() / 1000;
                    break;
                }
            }
        }
        if(downPressed || upPressed) this.lastInventoryTouchTime = Date.now() / 1000;
        const deltaTime = this.clock.getDelta();

        if(downPressed && !this.oldDownPressed)
            this.selectedInventoryItem++;
        if(upPressed && !this.oldUpPressed)
            this.selectedInventoryItem--;
        if(this.inputHandler.getKey('enter'))
            this.lastInventoryTouchTime = 0; //hide inventory

        if(this.selectedInventoryItem < 0)
            this.selectedInventoryItem = this.inventoryItems.length - 1;
        if(this.selectedInventoryItem >= this.inventoryItems.length)
            this.selectedInventoryItem = 0;

        this.cameraY = this.selectedInventoryItem; //might be backwards
        if(Date.now()/1000 - this.lastInventoryTouchTime > 2)
            this.cameraX = -1;
        else
            this.cameraX = 0;


        this.camera.position.lerp(new THREE.Vector3(this.cameraX, this.selectedInventoryItem, 5), 0.4 * deltaTime * 60);

        for(const item of this.inventoryItems) {
           item.onFrame(heldItemInput, this.selectedInventoryItem);
        }

        this.oldDownPressed = downPressed;
        this.oldUpPressed = upPressed;
    }
}