import * as THREE from 'three';
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader";
import {DRACOLoader} from "three/examples/jsm/loaders/DRACOLoader";
import { Renderer } from './Renderer';
import {computeBoundsTree} from "three-mesh-bvh";
import {CollisionManager} from "./CollisionManager";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;

export class Map {
    private scene: THREE.Scene;
    private mapObject: THREE.Group;
    private mapUrl: string;
    private collisionManager: CollisionManager;

    constructor(mapUrl: string, renderer: Renderer, collisionManager: CollisionManager) {
        this.mapUrl = mapUrl;
        this.scene = renderer.getScene();
        this.collisionManager = collisionManager;
        this.init();
    }

    private init() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            this.mapUrl,
            (gltf) => {
                this.mapObject = gltf.scene;
                    this.collisionManager.staticGeometry(gltf.scene);
                this.scene.add(this.mapObject);
            },
            undefined,
            () => {
                console.log("map loading error");
            }
        );
    }
}