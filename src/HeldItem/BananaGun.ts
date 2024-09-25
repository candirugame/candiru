//BananaGun.ts
import { HeldItem } from "./HeldItem";
import { HeldItemInput } from "./HeldItemInput";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as THREE from 'three';
import {Vector3} from "three";

const clock = new THREE.Clock();
const firingDelay = 0.15;
export class BananaGun extends HeldItem {
    scene: THREE.Scene = null;
    bananaObject = null;

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
            () => {
            }, //progress callback
            () => {
                console.log('banana loading error');
            }
        );
    }

    sceneAdded = false;
    hidden = false;


    onFrame(input: HeldItemInput) {
        if (this.bananaObject === null) return;
        if (!this.sceneAdded && !this.hidden) {
            this.scene.add(this.bananaObject);
            this.sceneAdded = true;
        }
        const deltaTime = clock.getDelta();

        // this.bananaObject.position.copy(unscopedPosition)
        // this.bananaObject.position.add(new THREE.Vector3(0,0,0.1*Math.sin(Date.now()/5000)))

        this.bananaObject.quaternion.identity();

        // Create a quaternion for a 90-degree rotation around the Y-axis
        const angle = Math.PI / 2; // 90 degrees in radians
        const axis = new THREE.Vector3(0, -1, 0); // Y-axis
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(axis, angle);
        this.bananaObject.quaternion.multiplyQuaternions(quaternion, this.bananaObject.quaternion);

        const angle2 = 3.8; // 90 degrees in radians
        const axis2 = new THREE.Vector3(1, 0, -0.03); // Y-axis
        const quaternion2 = new THREE.Quaternion();
        quaternion2.setFromAxisAngle(axis2, angle2);
        this.bananaObject.quaternion.multiplyQuaternions(quaternion2, this.bananaObject.quaternion);

        if(!this.hidden){
            this.handleInput(input,deltaTime);
        }

        if (this.hidden && this.sceneAdded) {
            moveTowardsPos(this.bananaObject.position, hiddenPosition, 0.1*deltaTime*60);
            if(Date.now()/1000 - this.hiddenTimestamp > 3 ){
                this.scene.remove(this.bananaObject);
                this.sceneAdded = false;
            }
        }
    }
    lastFired = 0;
    handleInput(input: HeldItemInput, deltaTime:number) {
        if (input.rightClick){
            moveTowardsPos(this.bananaObject.position, scopedPosition, 0.3*deltaTime*60);
        }
        else{
            moveTowardsPos(this.bananaObject.position, unscopedPosition, 0.1*deltaTime*60);
        }


        if(input.leftClick) {
            if (input.leftClick && Date.now() / 1000 - this.lastFired > firingDelay) {
                this.lastFired = Date.now() / 1000;
                console.log('Firing banana');
                this.bananaObject.position.add(new Vector3(0,0,0.6));
                //moveTowards(this.bananaObject.position, this.bananaObject.,1);

            }
        }
    }

    hiddenTimestamp = 0;

    show(){
        if(!this.hidden) return;
        this.hidden=false;
    }
    hide(){
        if(this.hidden) return;
        this.hidden=true;
        this.hiddenTimestamp = Date.now()/1000;
    }

}

function moveTowardsPos(source: THREE.Vector3, target: THREE.Vector3, frac: number) {
    const newX = source.x + frac * (target.x - source.x);
    const newY = source.y + frac * (target.y - source.y);
    const newZ = source.z + frac * (target.z - source.z);
    source.set(newX, newY, newZ);
}

function moveTowardsRot(source: THREE.Quaternion, target: THREE.Quaternion, frac: number) {
    const newQuat = new THREE.Quaternion();
    newQuat.slerp(target, frac);
    source.copy(newQuat);
}



const scopedPosition = new THREE.Vector3(0,-0.6,3.5);
const unscopedPosition = new THREE.Vector3(0.85,-0.8,3.2);
const hiddenPosition = new THREE.Vector3(0.85,-2.12,3.2);

const identityQuaternion = new THREE.Quaternion(new THREE.Vector3(0, -1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, -0.03), 3.8));

