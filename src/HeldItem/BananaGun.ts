import { HeldItem } from "./HeldItem";
import { HeldItemInput } from "./HeldItemInput";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as THREE from 'three';
import { Vector3 } from "three";

const clock = new THREE.Clock();
const firingDelay = 0.12;
const firingDelayHeld = 0.225;

export class BananaGun extends HeldItem {
    scene: THREE.Scene = null;
    bananaObject = null;
    sceneAdded = false;
    hidden = false;
    lastInput: HeldItemInput = new HeldItemInput();
    lastFired = 0;
    hiddenTimestamp = 0;

    constructor(scene: THREE.Scene) {
        super(); // Assuming HeldItem is a class
        this.scene = scene;
        this.init();
    }

    init() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            'models/simplified_banana_1.glb',
            (gltf) => {
                this.bananaObject = gltf.scene;
                this.bananaObject.traverse((child) => {
                    if (child.isMesh) {
                        child.renderOrder = 999;
                        child.material.depthTest = false;
                    }
                });
            },
            () => {},
            () => {
                console.log('banana loading error');
            }
        );
    }

    onFrame(input: HeldItemInput) {
        if (this.bananaObject === null) return;
        if (!this.sceneAdded && !this.hidden) {
            this.scene.add(this.bananaObject);
            this.sceneAdded = true;
        }

        const deltaTime = clock.getDelta();
        if (!this.hidden) {
            this.handleInput(input, deltaTime);
        }

        if (this.hidden && this.sceneAdded) {
            moveTowardsPos(this.bananaObject.position, hiddenPosition, 0.1 * deltaTime * 60);
            if (Date.now() / 1000 - this.hiddenTimestamp > 3) {
                this.scene.remove(this.bananaObject);
                this.sceneAdded = false;
            }
        }
    }

    handleInput(input: HeldItemInput, deltaTime: number) {
        if (input.rightClick) {
            moveTowardsPos(this.bananaObject.position, scopedPosition, 0.3 * deltaTime * 60);
        } else {
            moveTowardsPos(this.bananaObject.position, unscopedPosition, 0.1 * deltaTime * 60);
        }

        moveTowardsRot(this.bananaObject.quaternion, scopedQuaternion, 0.1 * deltaTime * 60);

        if (input.leftClick && (!this.lastInput.leftClick || Date.now() / 1000 - this.lastFired > firingDelayHeld)) {
            if (input.leftClick && Date.now() / 1000 - this.lastFired > firingDelay) {
                this.lastFired = Date.now() / 1000;
                console.log('Firing banana');
                this.bananaObject.position.add(new Vector3(0, 0, 0.6));
                rotateAroundWorldAxis(this.bananaObject.quaternion, new THREE.Vector3(1, 0, 0), Math.PI / 16);
            }
        }

        this.lastInput = input;
    }

    show() {
        if (!this.hidden) return;
        this.hidden = false;
    }

    hide() {
        if (this.hidden) return;
        this.hidden = true;
        this.hiddenTimestamp = Date.now() / 1000;
    }
}

function rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
    const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    source.multiplyQuaternions(rotationQuat, source);
}

function moveTowardsPos(source: THREE.Vector3, target: THREE.Vector3, frac: number) {
    const newX = source.x + frac * (target.x - source.x);
    const newY = source.y + frac * (target.y - source.y);
    const newZ = source.z + frac * (target.z - source.z);
    source.set(newX, newY, newZ);
}

function moveTowardsRot(source: THREE.Quaternion, target: THREE.Quaternion, frac: number) {
    source.slerp(target, frac);
}

const scopedPosition = new THREE.Vector3(0, -0.6, 3.5);
const unscopedPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.12, 3.2);
const scopedQuaternion = new THREE.Quaternion(0.64, 0.22, -0.69, -0.22);
