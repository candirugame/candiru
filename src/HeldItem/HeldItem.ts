import * as THREE from 'three';
import { HeldItemInput } from './HeldItemInput';

export abstract class HeldItem{
    constructor(scene:THREE.Scene);
    abstract init():void;
    abstract onFrame(input:HeldItemInput):void;
    abstract hide():void;
    abstract show():void;
    abstract itemDepleted():boolean;
}