//BananaGun.ts
import { HeldItem } from "./HeldItem";
import { HeldItemInput } from "./HeldItemInput";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as THREE from 'three';

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
            () => {}, //progress callback
            () => { console.log('banana loading error'); }
        );
    }

    sceneAdded = false;

    onFrame(input: HeldItemInput) {
        if(this.bananaObject === null) return;
        if (!this.sceneAdded) {
            this.scene.add(this.bananaObject);
            this.sceneAdded = true;
        }


        // this.bananaObject.position.copy(unscopedPosition)
        // this.bananaObject.position.add(new THREE.Vector3(0,0,0.1*Math.sin(Date.now()/5000)))

        this.bananaObject.quaternion.identity();

        // Create a quaternion for a 90-degree rotation around the Y-axis
        const angle = Math.PI / 2; // 90 degrees in radians
        const axis = new THREE.Vector3(0, -1, 0); // Y-axis
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(axis, angle);
        this.bananaObject.quaternion.multiplyQuaternions(quaternion, this.bananaObject.quaternion)

        const angle2 = 3.8; // 90 degrees in radians
        const axis2 = new THREE.Vector3(1, 0, -0.03); // Y-axis
        const quaternion2 = new THREE.Quaternion();
        quaternion2.setFromAxisAngle(axis2, angle2);
        this.bananaObject.quaternion.multiplyQuaternions(quaternion2, this.bananaObject.quaternion)

        if (input.rightClick)
            moveTowards(this.bananaObject.position, scopedPosition, 0.2);
        else
            moveTowards(this.bananaObject.position, unscopedPosition, 0.1);

    }

}

function moveTowards(source: THREE.Vector3, target: THREE.Vector3, frac: number) {
    const newX = source.x + frac * (target.x - source.x);
    const newY = source.y + frac * (target.y - source.y);
    const newZ = source.z + frac * (target.z - source.z);
    source.set(newX, newY, newZ);
}


const scopedPosition = new THREE.Vector3(0,-0.6,3.5);
const unscopedPosition = new THREE.Vector3(0.85,-0.8,3.2);