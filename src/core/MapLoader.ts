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

    constructor(renderer: Renderer) {
        this.scene = renderer.getScene();
    }

    public load(mapUrl: string) {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            mapUrl,
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