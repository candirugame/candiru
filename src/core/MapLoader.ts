import * as THREE from 'three';
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {DRACOLoader} from "three/examples/jsm/loaders/DRACOLoader.js";
import { Renderer } from './Renderer.ts';
import {computeBoundsTree} from "three-mesh-bvh";
import {CollisionManager} from "../input/CollisionManager.ts";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;

export class MapLoader {
    private scene: THREE.Scene;
    private mapObject: THREE.Group | undefined;
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
            (gltf: { scene: THREE.Group; }) => {
                this.mapObject = gltf.scene;
                CollisionManager.staticGeometry(gltf.scene);
                this.scene.add(this.mapObject);
            },
            undefined,
            () => {
                console.log("map loading error");
            }
        );
    }
}