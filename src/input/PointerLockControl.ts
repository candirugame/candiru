/**
 * ThreeJS's PointerLockControls in TypeScript ( by https://github.com/TBubba ).
 *
 * NOTE: I have barely tested this so it may contain bugs that are not in the original or otherwise not be fully compatible with it.
 *
 * Original: https://github.com/mrdoob/three.js/blob/master/examples/jsm/controls/PointerLockControls.js
 *
 * @author mrdoob / http://mrdoob.com/
 * @author Mugen87 / https://github.com/Mugen87
 */

import * as THREE from 'three';
import {Player} from "../core/Player.ts";

const PI_2 = Math.PI / 2;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const direction = new THREE.Vector3(0, 0, -1);

const changeEvent = { type: 'change' };
const lockEvent = { type: 'lock' };
const unlockEvent = { type: 'unlock' };

export class PointerLockControls extends THREE.EventDispatcher {
    public localPlayer: Player;
    public domElement: Element;
    public isLocked: boolean = false;
    private sensitivity: number = 0.002;


    constructor(localPlayer: Player, domElement: Element) {
        super();

        if (domElement === undefined) {
            console.warn('THREE.PointerLockControls: The second parameter "domElement" is now mandatory.');
            domElement = document.body;
        }

        this.localPlayer = localPlayer;
        this.domElement = domElement;

        this.connect();
    }

    public connect() {
        document.addEventListener('mousemove', this.onMouseMove, false);
        document.addEventListener('pointerlockchange', this.onPointerLockChange, false);
        document.addEventListener('pointerlockerror', this.onPointerLockError, false);
    }

    public disconnect() {
        document.removeEventListener('mousemove', this.onMouseMove, false);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange, false);
        document.removeEventListener('pointerlockerror', this.onPointerLockError, false);
    }

    public dispose() {
        this.disconnect();
    }

    public getObject() { // retaining this method for backward compatibility
        return this.localPlayer;
    }

    public getDirection = (v: THREE.Vector3) => {
        return v.copy(direction).applyQuaternion(this.localPlayer.lookQuaternion);
    };

    public lock(): void {
        this.domElement.requestPointerLock();
    }

    public unlock(): void {
        document.exitPointerLock();
    }

    private onMouseMove = (event: MouseEvent) => {
        if (!this.isLocked) return;

        const movementX = event.movementX || (event as unknown).mozMovementX || (event as unknown).webkitMovementX || 0;
        const movementY = event.movementY || (event as unknown).mozMovementY || (event as unknown).webkitMovementY || 0;

        euler.setFromQuaternion(this.localPlayer.lookQuaternion);

        euler.y -= movementX * this.sensitivity;
        euler.x -= movementY * this.sensitivity;

        euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));

        this.localPlayer.lookQuaternion.setFromEuler(euler);

        this.dispatchEvent(changeEvent);
    };

    private onPointerLockChange = () => {
        if (document.pointerLockElement === this.domElement) {
            this.dispatchEvent(lockEvent);
            this.isLocked = true;
        } else {
            this.dispatchEvent(unlockEvent);
            this.isLocked = false;
        }
    };

    private onPointerLockError = () => {
        console.error('THREE.PointerLockControls: Unable to use Pointer Lock API');
    };

    public setSensitivity(sensitivity: number): void {
        this.sensitivity = sensitivity;
    }
}