import * as THREE from 'three';
import { PointerLockControls } from './PointerLockControl.ts';
import { Renderer } from '../core/Renderer.ts';
import { Player } from '../core/Player.ts';
import {SettingsManager} from "../core/SettingsManager.ts";

export class InputHandler {
    private readonly gameIndex: number;
    private mouse: PointerLockControls;
    private gamepad: (Gamepad | null) = null;
    private readonly gamepadEuler ;
    private clock: THREE.Clock;
    private forward: THREE.Vector3;
    private keys: { [key: string]: boolean } = {};
    private leftMouseDown: boolean = false;
    private rightMouseDown: boolean = false;
    private renderer: Renderer;
    private readonly localPlayer: Player;
    private inputX: number = 0;
    private inputZ: number = 0;
    public  jump = false;
    public prevVelocity: THREE.Vector3;
    private scrollClicksSinceLastCheck: number = 0;
    private readonly gamepadInputs: GamepadInputs;
    private shoot: boolean = false;
    private aim: boolean = false;
    public nameSettingActive: boolean = false;
    private touchJoyX: number = 0;
    private touchJoyY: number = 0;
    private touchLookX: number = 0;
    private touchLookY: number = 0;
    private inventoryIterationTouched: boolean = false;

    constructor(renderer: Renderer, localPlayer: Player, nextGameIndex: number) {
        this.renderer = renderer;
        this.localPlayer = localPlayer;
        this.prevVelocity = new THREE.Vector3();
        this.gamepadEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        this.clock = new THREE.Clock();
        this.mouse = new PointerLockControls(this.localPlayer, document.body);
        this.forward = new THREE.Vector3(0, 0, -1);

        this.gamepadInputs = new GamepadInputs();

        this.gameIndex = nextGameIndex;

        if(!navigator.getGamepads()) {
            console.log("Browser does not support Gamepad API.")
        }

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
        const deltaTimeAcceleration = this.localPlayer.acceleration * deltaTime;

        let dist = 1;
        let speedMultiplier: number = 1;
        this.jump = false;
        this.aim = false;
        this.shoot = false;

        const oldInputZ = this.inputZ;
        const oldInputX = this.inputX;

        this.gamepad = navigator.getGamepads()[this.gameIndex];
        if(this.gamepad) {
            if(this.gamepad.connected) {
                this.updateGamepadInputArray(this.gamepad);
                this.gamepadEuler.setFromQuaternion(this.localPlayer.lookQuaternion);
                if (Math.abs(this.gamepadInputs.leftJoyX) >= .1) this.inputX += deltaTimeAcceleration * this.gamepadInputs.leftJoyX;
                if (Math.abs(this.gamepadInputs.leftJoyY) >= .1) this.inputZ += deltaTimeAcceleration * this.gamepadInputs.leftJoyY;
                const vectorLength = Math.sqrt((this.gamepadInputs.leftJoyX * this.gamepadInputs.leftJoyX) + (this.gamepadInputs.leftJoyY * this.gamepadInputs.leftJoyY));
                if (vectorLength >= .1) speedMultiplier = Math.min(Math.max(vectorLength, 0), 1);
                if (this.gamepadInputs.A) this.jump = true;
                if (this.gamepadInputs.leftTrigger > .5) this.aim = true;
                if (this.gamepadInputs.rightTrigger > .5) this.shoot = true;
                this.gamepadEuler.y -= this.gamepadInputs.rightJoyX * SettingsManager.settings.controllerSense * deltaTime;
                this.gamepadEuler.x -= this.gamepadInputs.rightJoyY * SettingsManager.settings.controllerSense * deltaTime;
                this.gamepadEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.gamepadEuler.x));
                this.localPlayer.lookQuaternion.setFromEuler(this.gamepadEuler);
            }
        }

        //touch joystick controls
        this.inputX += deltaTimeAcceleration * this.touchJoyX;
        this.inputZ += deltaTimeAcceleration * this.touchJoyY;

        //touch look controls
        const touchSensitivity = 0.03; // Adjust sensitivity as needed
        this.gamepadEuler.setFromQuaternion(this.localPlayer.lookQuaternion);
        this.gamepadEuler.y -= this.touchLookX * touchSensitivity;
        this.gamepadEuler.x -= this.touchLookY * touchSensitivity;
        this.gamepadEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.gamepadEuler.x));
        this.localPlayer.lookQuaternion.setFromEuler(this.gamepadEuler);

        //touch buttons





        if (!this.localPlayer.chatActive && !this.nameSettingActive) {
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

        if(this.localPlayer.health <= 0) dist = 0; //don't allow movement when health = 0

       this.prevVelocity.copy(this.localPlayer.velocity);

        this.localPlayer.velocity.z = dist * this.inputZ;
        this.localPlayer.velocity.x = dist * this.inputX;
        this.localPlayer.velocity.y = 0;
        this.localPlayer.velocity.clampLength(0, this.localPlayer.speed * speedMultiplier);
        this.localPlayer.velocity.y = this.prevVelocity.y;
        this.inputZ = this.localPlayer.velocity.z;
        this.inputX = this.localPlayer.velocity.x;

        const euler = new THREE.Euler().setFromQuaternion(this.localPlayer.lookQuaternion, 'YXZ');
        euler.x = 0;
        euler.z = 0;
        this.localPlayer.quaternion.setFromEuler(euler);
        this.localPlayer.velocity.applyQuaternion(this.localPlayer.quaternion);

        if (this.leftMouseDown) this.shoot = true;
        if (this.rightMouseDown) this.aim = true;

    }

    public getKey(key: string):boolean {
        return this.keys[key];
    }

    public setTouchJoyInput(x: number, y: number) {
        this.touchJoyX = x;
        this.touchJoyY = y;
    }

    public setLastTouchLookDelta(x: number, y: number) {
        this.touchLookX = x;
        this.touchLookY = y;
    }
    public setButtonsHeld(buttons: number[]) {
        this.leftMouseDown = buttons.includes(-1);
        this.jump = buttons.includes(0);
        this.inventoryIterationTouched = buttons.includes(1);

    }

    public getInventoryIterationTouched() {
        return this.inventoryIterationTouched;
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

    public getShoot() {
        return this.shoot;
    }

    public getAim() {
        return this.aim;
    }

    public getGamepadInputs(): GamepadInputs {
        return this.gamepadInputs;
    }

    public deregisterAllKeys(){
        const locked = document.pointerLockElement === document.body;
        if(!locked)
            this.keys = {};
    }

    public getInputX() {
        return this.inputX;
    }

    public getInputZ() {
        return this.inputZ;
    }

    private static approachZero(input: number, step: number): number {
        if (input == 0) {return 0;}
        let sign: number = 1;
        if (input < 0) {sign = -1;}
        const output: number = Math.abs(input) - step;
        if (output <= 0) {return  0;}
        return sign * output;
    }

    private updateGamepadInputArray(gamepad: Gamepad) {
        if (gamepad.axes[4]) {
            this.gamepadInputs.leftTrigger = gamepad.axes[4];
            this.gamepadInputs.rightTrigger = gamepad.axes[5];
        } else {
            this.gamepadInputs.leftTrigger = gamepad.buttons[6].value;
            this.gamepadInputs.rightTrigger = gamepad.buttons[7].value;
        }
        this.gamepadInputs.leftJoyX = gamepad.axes[0];
        this.gamepadInputs.leftJoyY = gamepad.axes[1];
        this.gamepadInputs.A = gamepad.buttons[0].pressed;
        this.gamepadInputs.rightJoyX = gamepad.axes[2];
        this.gamepadInputs.rightJoyY = gamepad.axes[3];
        this.gamepadInputs.leftShoulder = gamepad.buttons[4].pressed
        this.gamepadInputs.rightShoulder= gamepad.buttons[5].pressed
    }

}

class GamepadInputs {
    leftJoyX: number = 0;
    leftJoyY: number = 0;
    rightJoyX: number = 0;
    rightJoyY: number = 0;
    leftTrigger: number= 0;
    rightTrigger: number = 0;
    leftShoulder: boolean = false;
    rightShoulder: boolean = false;
    A: boolean = false;
    B: boolean = false;
    X: boolean = false;
    Y: boolean = false;
}
