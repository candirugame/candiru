import { ItemBaseNew, ItemType } from './ItemBaseNew';
import { HeldItemInput } from '../input/HeldItemInput';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';
import { Renderer } from '../core/Renderer';
import { Networking } from '../core/Networking';

const firingDelay = 0.12;
const firingDelayHeld = 0.225;
const showInHandDelay = 0.1;

const scopedPosition = new THREE.Vector3(0, -0.6, 3.5);
const unscopedPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.7, 3.2);
const scopedQuaternion = new THREE.Quaternion(0.64, 0.22, -0.69, -0.22);
const inventoryQuaternionBase = new THREE.Quaternion(0, 0, 0, 1);

export class BananaGun extends ItemBaseNew {
    private renderer: Renderer;
    private networking: Networking;
    private lastInput: HeldItemInput = new HeldItemInput();
    private lastFired: number = 0;
    private lastShotSomeoneTimestamp: number = 0;
    private angleAccum: number = 0;
    private addedToHandScene: boolean = false;

    constructor(renderer: Renderer, networking: Networking, index: number) {
        super(ItemType.InventoryItem, renderer.getHeldItemScene(), renderer.getInventoryMenuScene(), index);
        this.renderer = renderer;
        this.networking = networking;
    }

    public init() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            'models/simplified_banana_1.glb',
            (gltf) => {
                this.object = gltf.scene;
                this.object.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.renderOrder = 999;
                        (child as THREE.Mesh).material.depthTest = false;
                    }
                });
                this.inventoryMenuObject = this.object.clone();
                this.inventoryMenuObject.scale.set(0.8, 0.8, 0.8);
            },
            undefined,
            () => {
                console.log('Banana model loading error');
            }
        );
    }

    public onFrame(input: HeldItemInput, selectedIndex: number) {
        if (!this.object) return;
        const deltaTime = this.clock.getDelta();
        this.timeAccum += deltaTime;
        this.angleAccum += deltaTime;

        this.inventoryOnFrame(deltaTime, selectedIndex);
        this.handOnFrame(deltaTime, input);
    }

    public inventoryOnFrame(deltaTime: number, selectedIndex: number) {
        if (!this.addedToInventoryItemScenes) {
            this.inventoryMenuScene.add(this.inventoryMenuObject);
            this.addedToInventoryItemScenes = true;
        }

        this.angleAccum += deltaTime;
        this.inventoryMenuObject.position.set(0, this.index, 0);

        const targetQuaternion = inventoryQuaternionBase.clone();
        if (this.index === selectedIndex) {
            rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(0, 1, 0), this.angleAccum * 4);
            this.showInHand();
        } else {
            this.hideInHand();
        }
       // rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(1, 0, 0), Math.PI / 4);
        this.inventoryMenuObject.quaternion.slerp(targetQuaternion, 0.1 * 60 * deltaTime);
    }

    public handOnFrame(deltaTime: number, input: HeldItemInput) {
        if (!this.object) return;

        if (this.shownInHand && !this.addedToHandScene) {
            this.scene.add(this.object);
            this.addedToHandScene = true;
        }

        if (this.shownInHand && Date.now() / 1000 - this.shownInHandTimestamp > showInHandDelay) {
            this.handleInput(input, deltaTime);
        } else {
            this.handPosition.lerp(hiddenPosition, 0.1 * 60 * deltaTime);
            this.object.position.copy(this.handPosition);
            if (Date.now() / 1000 - this.shownInHandTimestamp > 3 && this.addedToHandScene) {
                this.scene.remove(this.object);
                this.addedToHandScene = false;
            }
        }

        // Update crosshair flashing based on last shot timestamp
        this.renderer.crosshairIsFlashing = Date.now() / 1000 - this.lastShotSomeoneTimestamp < 0.05;
    }

    private handleInput(input: HeldItemInput, deltaTime: number) {
        if (input.rightClick)
            moveTowardsPos(this.handPosition, scopedPosition, 0.3 * deltaTime * 60);
        else
            moveTowardsPos(this.handPosition, unscopedPosition, 0.1 * deltaTime * 60);

        this.object.position.copy(this.handPosition);

        moveTowardsRot(this.object.quaternion, scopedQuaternion, 0.1 * deltaTime * 60);

        if (input.leftClick && (!this.lastInput.leftClick || Date.now() / 1000 - this.lastFired > firingDelayHeld)) {
            if (Date.now() / 1000 - this.lastFired > firingDelay) {
                this.lastFired = Date.now() / 1000;
                this.shootBanana();
                this.handPosition.add(new THREE.Vector3(0, 0, 0.6));
                rotateAroundWorldAxis(this.object.quaternion, new THREE.Vector3(1, 0, 0), Math.PI / 16);
            }
        }

        this.lastInput = input;
    }

    public showInHand() {
        if (this.shownInHand) return;
        this.shownInHand = true;
        this.shownInHandTimestamp = Date.now() / 1000;
        if (!this.addedToHandScene && this.object) {
            this.scene.add(this.object);
            this.addedToHandScene = true;
        }
    }

    public hideInHand() {
        if (!this.shownInHand) return;
        this.shownInHand = false;
        if (this.addedToHandScene && this.object) {
            this.scene.remove(this.object);
            this.addedToHandScene = false;
        }
    }

    public itemDepleted(): boolean {
        return false;
    }

    private shootBanana() {
        const targets = this.renderer.getRemotePlayerIDsInCrosshair();
        if (targets.length > 0) {
            for (const id of targets) {
                this.networking.applyDamage(id, 10);
            }
            this.lastShotSomeoneTimestamp = Date.now() / 1000;
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