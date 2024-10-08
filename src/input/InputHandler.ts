import * as THREE from 'three';
import { PointerLockControls } from './PointerLockControl';
import { Renderer } from '../core/Renderer';
import { Player } from '../core/Player';

export class InputHandler {
    private mouse: PointerLockControls;
    private clock: THREE.Clock;
    private forward: THREE.Vector3;
    private keys: { [key: string]: boolean };
    private leftMouseDown: boolean;
    private rightMouseDown: boolean;
    private renderer: Renderer;
    private localPlayer: Player;
    private inputX: number;
    private inputZ: number;
    public  jump;

    constructor(renderer: Renderer, localPlayer: Player) {
        this.renderer = renderer;
        this.localPlayer = localPlayer;

        this.clock = new THREE.Clock();
        this.mouse = new PointerLockControls(this.localPlayer, document.body);
        this.forward = new THREE.Vector3(0, 0, -1);

        this.keys = {};
        this.leftMouseDown = false;
        this.rightMouseDown = false;
        this.inputX = 0;
        this.inputZ = 0;
        this.jump = false;

        this.setupEventListeners();
    }

    private setupEventListeners() {
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        document.addEventListener('mouseleave', this.onMouseUp.bind(this));
        document.addEventListener('click', () => {
            this.mouse.lock();
        });

        document.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    public handleInputs() {
        const deltaTime: number = this.clock.getDelta();
        const camera = this.renderer.getCamera();
        const deltaTimeAcceleration = this.localPlayer.acceleration * deltaTime;

        let dist = 0;

        const oldInputZ = this.inputZ;
        const oldInputX = this.inputX;

        if (!this.localPlayer.chatActive) {
            if (this.getKey('w')) this.inputZ -= deltaTimeAcceleration;
            if (this.getKey('s')) this.inputZ += deltaTimeAcceleration;
            if (this.getKey('a')) this.inputX -= deltaTimeAcceleration;
            if (this.getKey('d')) this.inputX += deltaTimeAcceleration;
            this.jump = this.getKey(' ');
        }

        switch (this.inputZ - oldInputZ) {
            case 0:
                this.inputZ = InputHandler.approachZero(this.inputZ, deltaTimeAcceleration);
        }

        switch (this.inputX - oldInputX) {
            case 0:
                this.inputX = InputHandler.approachZero(this.inputX, deltaTimeAcceleration);
        }

        if (this.inputX !== 0 || this.inputZ !== 0) dist = 1;
        if(this.localPlayer.health <= 0) dist = 0; //don't allow movement when health = 0

        this.localPlayer.velocity.z = dist * this.inputZ;
        this.localPlayer.velocity.x = dist * this.inputX;
        this.localPlayer.velocity.clampLength(0, this.localPlayer.speed);
        this.inputZ = this.localPlayer.velocity.z;
        this.inputX = this.localPlayer.velocity.x;

        camera.setRotationFromQuaternion(this.localPlayer.lookQuaternion);
        const euler = new THREE.Euler().setFromQuaternion(this.localPlayer.lookQuaternion, 'YXZ');
        euler.x = 0;
        euler.z = 0;
        this.localPlayer.quaternion.setFromEuler(euler);
        this.localPlayer.velocity.applyQuaternion(this.localPlayer.quaternion);
    }

    public getKey(key: string):boolean {
        return this.keys[key];
    }

    private onKeyDown(event: KeyboardEvent) {
        //event.preventDefault();
        if(event.key === 'Tab' || event.key === "'"|| event.key === '/') event.preventDefault();
        const key = event.key.toLowerCase();
        this.keys[key] = true;
    }

    private onKeyUp(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        this.keys[key] = false;
    }

    private onMouseDown(event: MouseEvent) {
        if (event.button === 0) {
            this.leftMouseDown = true;
        } else if (event.button === 2) {
            this.rightMouseDown = true;
        }
    }

    private onMouseUp(event: MouseEvent) {
        if (event.button === 0) {
            this.leftMouseDown = false;
        } else if (event.button === 2) {
            this.rightMouseDown = false;
        }
    }

    public getLeftMouseDown() {
        return this.leftMouseDown;
    }

    public getRightMouseDown() {
        return this.rightMouseDown;
    }

    private static approachZero(input: number, step: number): number {
        if (input == 0) {return 0;}
        let sign: number = 1;
        if (input < 0) {sign = -1;}
        const output: number = Math.abs(input) - step;
        if (output <= 0) {return  0;}
        return sign * output;
    }
}