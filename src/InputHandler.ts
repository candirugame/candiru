import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Renderer } from './Renderer';
import { Player } from './Player';

export class InputHandler {
    private mouse: PointerLockControls;
    private forward: THREE.Vector3;
    private direction: THREE.Vector3;
    private keys: { [key: string]: boolean };
    private leftMouseDown: boolean;
    private rightMouseDown: boolean;
    private renderer: Renderer;
    private localPlayer: Player;

    constructor(renderer: Renderer, localPlayer: Player) {
        this.renderer = renderer;
        this.localPlayer = localPlayer;

        this.mouse = new PointerLockControls(this.renderer.getCamera(), document.body);
        this.forward = new THREE.Vector3(0, 0, -1);
        this.direction = new THREE.Vector3();

        this.keys = {};
        this.leftMouseDown = false;
        this.rightMouseDown = false;

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
        const camera = this.renderer.getCamera();
        if (this.localPlayer.chatActive) return;

        let inputX = 0;
        let inputZ = 0;
        let dist = 0;
        let dir = 0;

        if (this.getKey('w')) inputX -= 1;
        if (this.getKey('s')) inputX += 1;
        if (this.getKey('a')) inputZ -= 1;
        if (this.getKey('d')) inputZ += 1;

        if (inputX !== 0 || inputZ !== 0) dist = 5;
        dir = Math.atan2(inputZ, inputX);

        this.localPlayer.velocity.z = dist * Math.cos(dir);
        this.localPlayer.velocity.x = dist * Math.sin(dir);

        camera.getWorldDirection(this.direction);
        this.direction.y = 0;
        this.localPlayer.quaternion.setFromUnitVectors(this.forward, this.direction.normalize());
        this.localPlayer.velocity.applyQuaternion(this.localPlayer.quaternion);
    }

    private getKey(key: string) {
        return !!this.keys[key];
    }

    private onKeyDown(event: KeyboardEvent) {
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
}