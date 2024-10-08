import { ItemBase } from './ItemBase';
import { HeldItemInput } from '../input/HeldItemInput';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';
import {Renderer} from "../core/Renderer";
import {Networking} from "../core/Networking";
import {select} from "three/src/nodes/math/ConditionalNode";

const firingDelay = 0.12;
const firingDelayHeld = 0.225;

export class BananaGun extends ItemBase {
    private handScene: THREE.Scene;
    private heldItemObject: THREE.Object3D;
    private worldObject: THREE.Object3D;
    private inventoryObject: THREE.Object3D;
    private sceneAdded: boolean = false;
    private hiddenInHand: boolean = true;
    private lastInput: HeldItemInput = new HeldItemInput();
    private lastFired: number = 0;
    private hiddenTimestamp: number = 0;
    private renderer:Renderer;
    private lastShotSomeoneTimestamp:number = 0;
    private networking:Networking;
    private clock = new THREE.Clock();

    constructor(renderer: Renderer, networking:Networking, index: number) {
        super(index);
        this.renderer = renderer;
        this.networking = networking;
        this.handScene = renderer.getHeldItemScene();
    }

    public init() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            'models/simplified_banana_1.glb',
            (gltf) => {
                this.heldItemObject = gltf.scene;
                this.heldItemObject.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.renderOrder = 999;
                        (child as THREE.Mesh).material.depthTest = false;
                    }
                });
                this.inventoryObject = this.heldItemObject.clone();
                this.worldObject = this.heldItemObject.clone();
            },
            undefined,
            () => {
                console.log('banana loading error');
            }
        );
    }

    public onFrame(input: HeldItemInput, selectedIndex: number) {
        if (!this.heldItemObject) return;
        if (!this.sceneAdded) {
            this.handScene.add(this.heldItemObject);
            this.renderer.getInventoryMenuScene().add(this.inventoryObject);
            this.inventoryObject.scale.set(0.8, 0.8, 0.8);
            this.inventoryObject.position.set(0, this.getIndex(), 0);
            this.sceneAdded = true;
        }
        const deltaTime = this.clock.getDelta();

       this.handRenderingStuff(input, deltaTime);
       this.inventoryRenderingStuff(selectedIndex);


    }

    public inventoryRenderingStuff(selectedIndex:number){
        if(this.index === selectedIndex)
            this.showInHand();
        else
            this.hideInHand();
    }

    public handRenderingStuff(input:HeldItemInput, deltaTime:number){
        if (!this.hiddenInHand) {
            this.handleInput(input, deltaTime);
        }

        if (this.hiddenInHand && this.sceneAdded) {
            moveTowardsPos(this.heldItemObject.position, hiddenPosition, 0.1 * deltaTime * 60);
            if (Date.now() / 1000 - this.hiddenTimestamp > 3) {
                this.handScene.remove(this.heldItemObject);
                this.sceneAdded = false;
            }
        }

        this.renderer.crosshairIsFlashing = Date.now()/1000 - this.lastShotSomeoneTimestamp <0.05;

    }

    private handleInput(input: HeldItemInput, deltaTime: number) {
        if (input.rightClick) {
            moveTowardsPos(this.heldItemObject.position, scopedPosition, 0.3 * deltaTime * 60);
        } else {
            moveTowardsPos(this.heldItemObject.position, unscopedPosition, 0.1 * deltaTime * 60);
        }

        moveTowardsRot(this.heldItemObject.quaternion, scopedQuaternion, 0.1 * deltaTime * 60);

        if (input.leftClick && (!this.lastInput.leftClick || Date.now() / 1000 - this.lastFired > firingDelayHeld)) {
            if (input.leftClick && Date.now() / 1000 - this.lastFired > firingDelay) {
                this.lastFired = Date.now() / 1000;
                this.shootBanana();
                this.heldItemObject.position.add(new THREE.Vector3(0, 0, 0.6));
                rotateAroundWorldAxis(this.heldItemObject.quaternion, new THREE.Vector3(1, 0, 0), Math.PI / 16);
            }
        }

        this.lastInput = input;
    }

    public showInHand() {
        if (!this.hiddenInHand) return;
        this.hiddenInHand = false;
    }

    public hideInHand() {
        if (this.hiddenInHand) return;
        this.hiddenInHand = true;
        this.hiddenTimestamp = Date.now() / 1000;
    }

    public itemDepleted(): boolean {
        return false;
    }

     shootBanana(){
        if(this.renderer.getRemotePlayerIDsInCrosshair().length>0){
            for(const id of this.renderer.getRemotePlayerIDsInCrosshair()){
                this.networking.applyDamage(id, 10);
            }
            this.lastShotSomeoneTimestamp = Date.now()/1000;
        }


    }

}



function rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
    const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    source.multiplyQuaternions(rotationQuat, source);
}

function moveTowardsPos(source: THREE.Vector3, target: THREE.Vector3, frac: number) {
    source.lerp(target, frac);
}

function moveTowardsRot(source: THREE.Quaternion, target: THREE.Quaternion, frac: number) {
    source.slerp(target, frac);
}

const scopedPosition = new THREE.Vector3(0, -0.6, 3.5);
const unscopedPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.7, 3.2);
const scopedQuaternion = new THREE.Quaternion(0.64, 0.22, -0.69, -0.22);