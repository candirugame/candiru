import * as THREE from 'three';
import { Renderer } from './Renderer';
import { InputHandler } from '../input/InputHandler';
import { BananaGun } from '../items/BananaGun';
import { HeldItemInput } from '../input/HeldItemInput';
import {Networking} from "./Networking";
import {ItemBase} from "../items/ItemBase";

export class Inventory {
    private inventoryItems: ItemBase[] = [];
    private renderer: Renderer;
    private inputHandler: InputHandler;
    private networking: Networking;
    private inventoryScene: THREE.Scene;

    constructor(renderer: Renderer, inputHandler: InputHandler, networking:Networking) {
        this.renderer = renderer;
        this.inputHandler = inputHandler;
        this.networking = networking;
        this.inventoryScene = renderer.getInventoryMenuScene();
    }

    public init() {
        for(const item of this.inventoryItems) {
            item.init();
        }
        const banana = new BananaGun(this.renderer, this.networking, this.inventoryItems.length);
        banana.init();
        this.inventoryItems.push(banana);
        //banana.showInHand();

        const banana2 = new BananaGun(this.renderer, this.networking, this.inventoryItems.length);
        banana2.init();
        this.inventoryItems.push(banana2);

        banana2.showInHand();

    }

    public onFrame() {
        const heldItemInput = new HeldItemInput(this.inputHandler.getLeftMouseDown(), this.inputHandler.getRightMouseDown(), false);
        for(const item of this.inventoryItems) {
           item.onFrame(heldItemInput);
        }
    }
}