import * as THREE from 'three';
import { Renderer } from './Renderer.ts';
import {computeBoundsTree} from "three-mesh-bvh";
import {CollisionManager} from "../input/CollisionManager.ts";
import { AssetManager } from "./AssetManager.ts";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;

export class MapLoader {
    private scene: THREE.Scene;
    private mapObject: THREE.Group | undefined;

    constructor(renderer: Renderer) {
        this.scene = renderer.getScene();
    }

    public load(mapUrl: string) {
        AssetManager.getInstance().loadAsset(mapUrl, (scene) => {
            this.mapObject = scene;
            CollisionManager.staticGeometry(scene);
            this.scene.add(this.mapObject);
        });
    }

}