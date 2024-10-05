import { HeldItem } from './HeldItem';
import { HeldItemInput } from './HeldItemInput';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';
import {Renderer} from "./Renderer";


const clock = new THREE.Clock();

export class HealthIndicator extends HeldItem {
    private scene: THREE.Scene;
    private bananaObject: THREE.Object3D;
    private sceneAdded: boolean = false;
    private renderer:Renderer;

    constructor(renderer: Renderer) {
        super();
        this.renderer = renderer;
        this.scene = renderer.getHeldItemScene();
    }

    public init() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            'models/possum.glb',
            (gltf) => {
                this.bananaObject = gltf.scene;
                this.bananaObject.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.renderOrder = 10006;
                        (child as THREE.Mesh).material.depthTest = false;
                    }
                });
            },
            undefined,
            () => {
                console.log('overlay possum loading error');
            }
        );
    }

    public onFrame() {
        if (!this.bananaObject) return;
        if (!this.sceneAdded) {
            this.scene.add(this.bananaObject);
            this.sceneAdded = true;
        }
        const deltaTime = clock.getDelta();

        moveTowardsPos(this.bananaObject.position, bottomLeftPosition, 0.1 * deltaTime * 60);
        moveTowardsRot(this.bananaObject.quaternion, baseQuaternion, 0.1 * deltaTime * 60);






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

const bottomLeftPosition = new THREE.Vector3(0, -0.6, 3.5);
const baseQuaternion = new THREE.Quaternion(0,0,0,1);