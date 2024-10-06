import { HeldItem } from './HeldItem';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';
import {Renderer} from "./Renderer";
import {Player} from "./Player";


const clock = new THREE.Clock();

export class HealthIndicator extends HeldItem {
    private scene: THREE.Scene;
    private possumObject: THREE.Object3D;
    private sceneAdded: boolean = false;
    private renderer:Renderer;
    private targetQuaternion: THREE.Quaternion = new THREE.Quaternion(0,0,0,1);
    private targetPosition: THREE.Vector3 = new THREE.Vector3(0,0,0);
    private localPlayer:Player;
    private rotatedAngle:number = 0;

    constructor(renderer: Renderer, localPlayer:Player) {
        super();
        this.renderer = renderer;
        this.localPlayer = localPlayer;
        this.scene = renderer.getHealthIndicatorScene();
    }

    public init() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            'models/simplified_possum.glb',
            (gltf) => {
                this.possumObject = gltf.scene;
                this.possumObject.traverse((child) => {
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
        if (!this.possumObject) return;
        if (!this.sceneAdded) {
            this.scene.add(this.possumObject);
            this.sceneAdded = true;
        }
        const deltaTime = clock.getDelta();
        const scaredLevel = Math.pow(this.localPlayer.health / 100,1); //0-1

        this.targetPosition.copy(basePosition);
        this.targetPosition.y += (1-scaredLevel) * 0.5 * Math.sin(1.1 * Math.PI * this.rotatedAngle);

        this.targetQuaternion.copy(baseQuaternion);
        rotateAroundWorldAxis(this.targetQuaternion, new THREE.Vector3(0, 0, 1), Math.PI - this.localPlayer.health * Math.PI / 100);

        this.rotatedAngle += 4 * deltaTime / (scaredLevel*3);
        rotateAroundWorldAxis(this.targetQuaternion, new THREE.Vector3(0, 1, 0),  this.rotatedAngle);

        moveTowardsPos(this.possumObject.position, this.targetPosition, 0.8 * deltaTime * 60);
        moveTowardsRot(this.possumObject.quaternion, this.targetQuaternion, 0.5 * deltaTime * 60);



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

const basePosition = new THREE.Vector3(0, 0, 1.2);
const baseQuaternion = new THREE.Quaternion(0,0,0,1);
