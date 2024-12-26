import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as THREE from 'three';
import {Renderer} from "../core/Renderer.ts";
import {Player} from "../core/Player.ts";
import {Networking} from "../core/Networking.ts";


const clock = new THREE.Clock();

export class HealthIndicator {
    private scene: THREE.Scene;
    private possumObject!: THREE.Object3D;
    private sceneAdded: boolean = false;
    private targetQuaternion: THREE.Quaternion = new THREE.Quaternion(0,0,0,1);
    private targetPosition: THREE.Vector3 = new THREE.Vector3(0,0,0);
    private rotatedAngle:number = 0;
    private ambientLight: THREE.AmbientLight;
    private lastHealth:number = 0;
    private lastHealthChangeWasDamage:boolean = false;
    private lightRGBI:number[] = [0,0,0,0];

    constructor(private renderer: Renderer, private localPlayer:Player, private networking: Networking) {
        this.scene = renderer.getHealthIndicatorScene();
        this.ambientLight = new THREE.AmbientLight(rgbToHex(0,0,0), 0);
        this.scene.add(this.ambientLight);
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
                        child.renderOrder = 999;
                        const applyDepthTest = (material: THREE.Material | THREE.Material[]) => {
                            if (Array.isArray(material))
                                material.forEach((mat) => applyDepthTest(mat));  // Recursively handle array elements
                            else
                                material.depthTest = false;
                        };
                        const mesh = child as THREE.Mesh;
                        applyDepthTest(mesh.material);
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

        let maxHealth = this.networking.getServerInfo().playerMaxHealth;
        if(maxHealth === 0) maxHealth = 0.001;

        const deltaTime = clock.getDelta();
        const scaredLevel = 1-Math.pow(this.localPlayer.health / maxHealth,1); //0-1
        this.renderer.scaredLevel = scaredLevel;

        this.targetPosition.copy(basePosition);
        this.targetPosition.y += scaredLevel * 0.5 * Math.sin(1.1 * Math.PI * this.rotatedAngle);
        this.targetPosition.y += (Math.random() - 0.5 ) * 0.2 * scaredLevel;
        this.targetPosition.x += (Math.random() - 0.5 ) * 0.2 * scaredLevel;
        this.targetPosition.z += (Math.random() - 0.5 ) * 0.2 * scaredLevel;

        this.targetQuaternion.copy(baseQuaternion);
        rotateAroundWorldAxis(this.targetQuaternion, new THREE.Vector3(0, 0, 1), Math.PI - this.localPlayer.health * Math.PI / maxHealth);

        this.rotatedAngle += 4 * deltaTime / (Math.max(0.001, (1-scaredLevel)*3));
        rotateAroundWorldAxis(this.targetQuaternion, new THREE.Vector3(0, 1, 0),  this.rotatedAngle);

        moveTowardsPos(this.possumObject.position, this.targetPosition, 0.8 * deltaTime * 60);
        moveTowardsRot(this.possumObject.quaternion, this.targetQuaternion, 0.5 * deltaTime * 60);

        let targetRGBI: number[];

        if(!this.lastHealthChangeWasDamage && this.localPlayer.health < maxHealth && this.rotatedAngle % 2 > 1)
            targetRGBI = [125,255,125,1.2];
        else
            targetRGBI = [255,255,255,0.5];


        for(let i = 0; i < 4; i++)
            this.lightRGBI[i] = this.lightRGBI[i] + (targetRGBI[i] - this.lightRGBI[i]) * 0.4 * deltaTime * 60;
        this.ambientLight.copy(new THREE.AmbientLight(rgbToHex(this.lightRGBI[0], this.lightRGBI[1], this.lightRGBI[2]),this.lightRGBI[3]));

        if(this.lastHealth<this.localPlayer.health)
            this.lastHealthChangeWasDamage = false;
        else if(this.lastHealth>this.localPlayer.health)
            this.lastHealthChangeWasDamage = true;
        this.lastHealth = this.localPlayer.health;
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

function rgbToHex(r:number, g:number, b:number) {
    return (r << 16) + (g << 8) + b;
}

const basePosition = new THREE.Vector3(0, 0, 1.2);
const baseQuaternion = new THREE.Quaternion(0,0,0,1);
