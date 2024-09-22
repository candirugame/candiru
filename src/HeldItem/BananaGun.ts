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
        if (!this.sceneAdded && this.bananaObject !== null) {
            this.scene.add(this.bananaObject);
            this.sceneAdded = true;
            this.bananaObject.position.set(0,-0.6,3)


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
        }

        // if (input.leftClick) {
        // console.log('banana gun shoots!');
        // }
    }

}
