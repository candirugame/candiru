import * as THREE from 'three';
import { PointerLockControls } from './PointerLockControl.ts';
import { Renderer } from '../core/Renderer.ts';
import { Player } from '../core/Player.ts';

export class InputHandler {
    private gameIndex: number;
    private mouse: PointerLockControls;
    private gamepad: (Gamepad | null) = null;
    private gamepadEuler ;
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
    public prevVelocity: THREE.Vector3;
    private scrollClicksSinceLastCheck: number = 0;

    constructor(renderer: Renderer, localPlayer: Player, nextGameIndex: number) {
        this.renderer = renderer;
        this.localPlayer = localPlayer;
        this.prevVelocity = new THREE.Vector3();
        this.gamepadEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        this.clock = new THREE.Clock();
        this.mouse = new PointerLockControls(this.localPlayer, document.body);
        this.forward = new THREE.Vector3(0, 0, -1);

        this.keys = {};
        this.leftMouseDown = false;
        this.rightMouseDown = false;
        this.inputX = 0;
        this.inputZ = 0;
        this.jump = false;

        this.gameIndex = nextGameIndex;

        this.setupEventListeners();
    }

    private setupEventListeners() {
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        document.addEventListener('mouseleave', this.onMouseUp.bind(this));
        document.addEventListener('blur', this.deregisterAllKeys.bind(this), false);
        document.addEventListener('pointerlockchange', this.deregisterAllKeys.bind(this), false);
        document.addEventListener('visibilitychange', this.deregisterAllKeys.bind(this), false);

        document.addEventListener('click', () => {
            this.mouse.lock();
        });

        document.addEventListener('contextmenu', (event) => {event.preventDefault();});

        document.addEventListener('wheel', this.processScroll.bind(this));
        if(navigator.getGamepads()) {
            self.addEventListener('gamepadconnected', this.onGamepadChange.bind(this));
            self.addEventListener('gamepaddisconnected', this.onGamepadChange.bind(this));
        } else {
            console.log("Browser does not support Gamepad API.")
        }
    }

    private processScroll(e :WheelEvent) {
        if(e.deltaY >= 4)
            this.scrollClicksSinceLastCheck++;
        if(e.deltaY <= -4)
            this.scrollClicksSinceLastCheck--;
    }

    public getScrollClicks() {
        const clicks = this.scrollClicksSinceLastCheck;
        this.scrollClicksSinceLastCheck = 0;
        return clicks;

    }

    public handleInputs() {
        const deltaTime: number = this.clock.getDelta();
        const camera = this.renderer.getCamera();
        const deltaTimeAcceleration = this.localPlayer.acceleration * deltaTime;

        let dist = 0;
        this.jump = false;

        const oldInputZ = this.inputZ;
        const oldInputX = this.inputX;

        if(this.gamepad) {
            if(this.gamepad.connected) {
                if (Math.abs(this.gamepad.axes[0]) >= .2) this.inputX += deltaTimeAcceleration * this.gamepad.axes[0];
                if (Math.abs(this.gamepad.axes[1]) >= .2) this.inputZ += deltaTimeAcceleration * this.gamepad.axes[1];
                if (this.gamepad.buttons[0].pressed) this.jump = true;
                this.rightMouseDown = this.gamepad.axes[4] > .5;
                this.leftMouseDown = this.gamepad.axes[5] > .5;
                this.gamepadEuler.y -= this.gamepad.axes[2] * .08;
                this.gamepadEuler.x -= this.gamepad.axes[3] * .08;
                this.gamepadEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.gamepadEuler.x));
                this.localPlayer.lookQuaternion.setFromEuler(this.gamepadEuler);
            }
        }

        if (!this.localPlayer.chatActive) {
            if (this.getKey('w')) this.inputZ -= deltaTimeAcceleration;
            if (this.getKey('s')) this.inputZ += deltaTimeAcceleration;
            if (this.getKey('a')) this.inputX -= deltaTimeAcceleration;
            if (this.getKey('d')) this.inputX += deltaTimeAcceleration;
            if (this.getKey(' ')) this.jump = true;

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

       this.prevVelocity.copy(this.localPlayer.velocity);

        this.localPlayer.velocity.z = dist * this.inputZ;
        this.localPlayer.velocity.x = dist * this.inputX;
        this.localPlayer.velocity.y = 0;
        this.localPlayer.velocity.clampLength(0, this.localPlayer.speed);
        this.localPlayer.velocity.y = this.prevVelocity.y;
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

    public getGamepad(): Gamepad | null {
        return this.gamepad;
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

    public deregisterAllKeys(){
        const locked = document.pointerLockElement === document.body;
        if(!locked)
            this.keys = {};
    }

    private onGamepadChange(_event: GamepadEvent) {
        this.gamepad = navigator.getGamepads()[this.gameIndex];
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