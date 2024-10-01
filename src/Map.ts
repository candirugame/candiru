import * as THREE from 'three';
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader";
import {DRACOLoader} from "three/examples/jsm/loaders/DRACOLoader";
import { Renderer } from './Renderer';

export class Map {
    private scene: THREE.Scene;
    private mapObject: THREE.Group;
    private mapUrl: string;

    constructor(mapUrl: string, renderer: Renderer) {
        this.mapUrl = mapUrl;
        this.scene = renderer.getScene();
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
                this.scene.add(this.mapObject);
            },
            undefined,
            () => {
                console.log("map loading error");
            }
        );
    }
}