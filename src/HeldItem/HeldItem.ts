import * as THREE from 'three';

abstract class HeldItem{
    constructor(scene:THREE.Scene);
    abstract init():void;
    abstract onFrame(input:HeldItemInput):void;
    abstract itemDepleted():boolean;
}