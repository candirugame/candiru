import * as THREE from 'three';
import { Player } from "../core/Player.ts";

// Define a custom event map interface
interface PointerLockControlEventMap {
    change: Event;
    lock: Event;
    unlock: Event;
}

// Extend the EventDispatcher class to use our custom event map
export class PointerLockControls extends THREE.EventDispatcher<PointerLockControlEventMap> {
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

    public connect(): void {
        document.addEventListener('mousemove', this.onMouseMove, false);
        document.addEventListener('pointerlockchange', this.onPointerLockChange, false);
        document.addEventListener('pointerlockerror', this.onPointerLockError, false);
    }

    public disconnect(): void {
        document.removeEventListener('mousemove', this.onMouseMove, false);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange, false);
        document.removeEventListener('pointerlockerror', this.onPointerLockError, false);
    }

    public dispose(): void {
        this.disconnect();
    }

    public getObject(): Player {
        return this.localPlayer;
    }

    public getDirection = (v: THREE.Vector3): THREE.Vector3 => {
        return v.copy(new THREE.Vector3(0, 0, -1)).applyQuaternion(this.localPlayer.lookQuaternion);
    };

    public lock(): void {
        this.domElement.requestPointerLock();
    }

    public unlock(): void {
        document.exitPointerLock();
    }

    private onMouseMove = (event: MouseEvent): void => {
        if (!this.isLocked) return;

        // deno-lint-ignore no-explicit-any
        const movementX = event.movementX || (event as any).mozMovementX || (event as any).webkitMovementX || 0;
        // deno-lint-ignore no-explicit-any
        const movementY = event.movementY || (event as any).mozMovementY || (event as any).webkitMovementY || 0;

        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(this.localPlayer.lookQuaternion);

        euler.y -= movementX * this.sensitivity;
        euler.x -= movementY * this.sensitivity;

        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

        this.localPlayer.lookQuaternion.setFromEuler(euler);

       // this.dispatchEvent({ type: 'change' });
    };

    private onPointerLockChange = (): void => {
        if (document.pointerLockElement === this.domElement) {
           // this.dispatchEvent({ type: 'lock' });
            this.isLocked = true;
        } else {
         //   this.dispatchEvent({ type: 'unlock' });
            this.isLocked = false;
        }
    };

    private onPointerLockError = (): void => {
        console.error('THREE.PointerLockControls: Unable to use Pointer Lock API');
    };

    public setSensitivity(sensitivity: number): void {
        this.sensitivity = sensitivity;
    }
}
