import * as THREE from 'three';
import { PointerLockControls } from './PointerLockControl.ts';
import { Renderer } from '../core/Renderer.ts';
import { SettingsManager } from '../core/SettingsManager.ts';
import { Player } from '../../shared/Player.ts';
import { Game } from '../core/Game.ts';
import { lerp } from '../../shared/Utils.ts';

export class InputHandler {
	private readonly gameIndex: number;
	private mouse: PointerLockControls;
	private gamepad: Gamepad | null = null;
	private readonly gamepadEuler;
	private clock: THREE.Clock;
	private keys: { [key: string]: boolean } = {};
	private leftMouseDown: boolean = false;
	private rightMouseDown: boolean = false;
	private renderer: Renderer;
	private readonly localPlayer: Player;
	private inputX: number = 0;
	private inputZ: number = 0;
	public jump = false;
	public prevInputVelocity: THREE.Vector3;
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
	private touchButtons: number[] = [];

	constructor(renderer: Renderer, localPlayer: Player, gameIndex: number) {
		this.renderer = renderer;
		this.localPlayer = localPlayer;
		this.prevInputVelocity = new THREE.Vector3();
		this.gamepadEuler = new THREE.Euler(0, 0, 0, 'YXZ');

		this.clock = new THREE.Clock();
		this.mouse = new PointerLockControls(this.localPlayer, document.body, gameIndex, this.renderer);

		this.gamepadInputs = new GamepadInputs();

		this.gameIndex = gameIndex;

		if (!navigator.getGamepads()) {
			console.log('Browser does not support Gamepad API.');
		}

		this.setupEventListeners();
	}

	public destroy() {
		this.mouse.dispose();
		this.keys = {};
		this.leftMouseDown = false;
		this.rightMouseDown = false;
		this.inputX = 0;
		this.inputZ = 0;
		this.jump = false;
		this.prevInputVelocity.set(0, 0, 0);
		this.scrollClicksSinceLastCheck = 0;
		this.gamepadInputs.leftJoyX = 0;
		this.gamepadInputs.leftJoyY = 0;
		this.gamepadInputs.rightJoyX = 0;
		this.gamepadInputs.rightJoyY = 0;
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

		document.addEventListener('contextmenu', (event) => {
			event.preventDefault();
		});

		document.addEventListener('wheel', this.processScroll.bind(this));
	}

	private processScroll(e: WheelEvent) {
		if (e.deltaY >= 4) {
			this.scrollClicksSinceLastCheck++;
		}
		if (e.deltaY <= -4) {
			this.scrollClicksSinceLastCheck--;
		}
	}

	public getScrollClicks() {
		const clicks = this.scrollClicksSinceLastCheck;
		this.scrollClicksSinceLastCheck = 0;
		return clicks;
	}

	public handleInputs() {
		const deltaTime: number = this.clock.getDelta();
		const acceleration = this.localPlayer.acceleration;

		let dist = 1;
		let speedMultiplier: number = 1;
		this.jump = false;
		this.aim = false;
		this.shoot = false;

		const oldInputZ = this.inputZ;
		const oldInputX = this.inputX;

		this.gamepad = navigator.getGamepads()[this.gameIndex];
		if (this.gamepad) {
			if (this.gamepad.connected) {
				this.updateGamepadInputArray(this.gamepad);
				this.gamepadEuler.setFromQuaternion(this.localPlayer.lookQuaternion);
				if (Math.abs(this.gamepadInputs.leftJoyX) >= .1) {
					this.inputX += acceleration * this.gamepadInputs.leftJoyX;
				}
				if (Math.abs(this.gamepadInputs.leftJoyY) >= .1) {
					this.inputZ += acceleration * this.gamepadInputs.leftJoyY;
				}
				const vectorLength = Math.sqrt(
					(this.gamepadInputs.leftJoyX * this.gamepadInputs.leftJoyX) +
						(this.gamepadInputs.leftJoyY * this.gamepadInputs.leftJoyY),
				);
				if (vectorLength >= .1) speedMultiplier = Math.min(Math.max(vectorLength, 0), 1);
				if (this.gamepadInputs.A) this.jump = true;
				if (this.gamepadInputs.leftTrigger > .5) this.aim = true;
				if (this.gamepadInputs.rightTrigger > .5) this.shoot = true;
				const aimAdjust = this.calculateAimAssist();
				this.gamepadEuler.y -= this.gamepadInputs.rightJoyX * SettingsManager.settings.controllerSense * deltaTime *
					aimAdjust * 4 / lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
				this.gamepadEuler.x -= this.gamepadInputs.rightJoyY * SettingsManager.settings.controllerSense * deltaTime *
					aimAdjust * 4 / lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
				this.gamepadEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.gamepadEuler.x));
				this.localPlayer.lookQuaternion.setFromEuler(this.gamepadEuler);
			}
		}

		//touch joystick controls
		if (Math.hypot(this.touchJoyY, this.touchJoyX) > 0.1) {
			const touchVectorLength = Math.hypot(this.touchJoyX, this.touchJoyY);
			speedMultiplier = Math.min(Math.max(touchVectorLength, 0), 1);
			this.inputX += acceleration * this.touchJoyX;
			this.inputZ += acceleration * this.touchJoyY;
		}

		const touchSensitivity = 0.03; // Adjust sensitivity as needed
		this.gamepadEuler.setFromQuaternion(this.localPlayer.lookQuaternion);

		if (!this.localPlayer.chatActive && !this.nameSettingActive) {
			if (this.getKey('w')) this.inputZ -= acceleration;
			if (this.getKey('s')) this.inputZ += acceleration;
			if (this.getKey('a')) this.inputX -= acceleration;
			if (this.getKey('d')) this.inputX += acceleration;
			const aimAdjust = this.calculateAimAssist();
			if (this.getKey('arrowright')) {
				this.gamepadEuler.y -= SettingsManager.settings.controllerSense * deltaTime * aimAdjust * 4 /
					lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
			}
			if (this.getKey('arrowleft')) {
				this.gamepadEuler.y += SettingsManager.settings.controllerSense * deltaTime * aimAdjust * 4 /
					lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
			}
			if (this.getKey('arrowup')) {
				this.gamepadEuler.x += SettingsManager.settings.controllerSense * deltaTime * aimAdjust * 4 /
					lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
			}
			if (this.getKey('arrowdown')) {
				this.gamepadEuler.x -= SettingsManager.settings.controllerSense * deltaTime * aimAdjust * 4 /
					lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
			}
			if (this.getKey(' ')) this.jump = true;
		}

		this.gamepadEuler.y -= this.touchLookX * touchSensitivity * SettingsManager.settings.sense /
			lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
		this.gamepadEuler.x -= this.touchLookY * touchSensitivity * SettingsManager.settings.sense /
			lerp(1, this.renderer.targetZoom, SettingsManager.settings.zoomSensT);
		this.gamepadEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.gamepadEuler.x));
		this.localPlayer.lookQuaternion.setFromEuler(this.gamepadEuler);

		switch (this.inputZ - oldInputZ) {
			case 0:
				this.inputZ = InputHandler.approachZero(this.inputZ, acceleration);
		}

		switch (this.inputX - oldInputX) {
			case 0:
				this.inputX = InputHandler.approachZero(this.inputX, acceleration);
		}

		if (this.localPlayer.health <= 0) dist = 0; //don't allow movement when health = 0

		this.localPlayer.inputVelocity.z = dist * this.inputZ;
		this.localPlayer.inputVelocity.x = dist * this.inputX;
		this.localPlayer.inputVelocity.y = 0;
		this.localPlayer.inputVelocity.clampLength(0, this.localPlayer.speed * speedMultiplier);
		this.inputZ = this.localPlayer.inputVelocity.z;
		this.inputX = this.localPlayer.inputVelocity.x;

		const euler = new THREE.Euler().setFromQuaternion(this.localPlayer.lookQuaternion, 'YXZ');
		euler.x = 0;
		euler.z = 0;
		const quaternion = new THREE.Quaternion().setFromEuler(euler);
		this.localPlayer.inputVelocity.applyQuaternion(quaternion);

		if (this.leftMouseDown || this.touchButtons.includes(0) && !Game.menuOpen) this.shoot = true;
		if (this.rightMouseDown && !Game.menuOpen) this.aim = true;

		if (this.touchButtons.includes(-3) && !Game.menuOpen) {
			const event = new KeyboardEvent('keydown', {
				key: 'Escape',
			});
			document.dispatchEvent(event);
		}

		if (this.localPlayer.playerSpectating !== -1) {
			this.inputX = 0;
			this.inputZ = 0;
			this.jump = false;
			this.shoot = false;
			this.aim = false;
		}
	}

	public getKey(key: string): boolean {
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
		this.touchButtons = buttons;
		this.jump = this.jump || buttons.includes(-1);
		this.inventoryIterationTouched = buttons.includes(1);
	}

	public getInventoryIterationTouched() {
		return this.inventoryIterationTouched;
	}

	private onKeyDown(event: KeyboardEvent) {
		if (this.gameIndex !== Game.nextGameIndex - 1) return;

		//event.preventDefault();
		if (event.key === 'Tab' || event.key === "'" || event.key === '/') event.preventDefault();
		const key = event.key.toLowerCase();
		this.keys[key] = true;

		if (!this.localPlayer.chatActive && !this.nameSettingActive) {
			if (key === 'c') {
				this.leftMouseDown = true;
			} else if (key === 'z') {
				this.rightMouseDown = true;
			}
			if (key === 'p') {
				this.renderer.createScreenshot();
			}
		}
	}

	private onKeyUp(event: KeyboardEvent) {
		if (this.gameIndex !== Game.nextGameIndex - 1) return;

		const key = event.key.toLowerCase();
		this.keys[key] = false;

		if (!this.localPlayer.chatActive && !this.nameSettingActive) {
			if (key === 'c') {
				this.leftMouseDown = false;
			} else if (key === 'z') {
				this.rightMouseDown = false;
			}
		}
	}

	private onMouseDown(event: MouseEvent) {
		if (this.gameIndex !== Game.nextGameIndex - 1) return;

		if (event.button === 0 && !Game.menuOpen) {
			this.leftMouseDown = true;
		} else if (event.button === 2 && !Game.menuOpen) {
			this.rightMouseDown = true;
		}
	}

	private onMouseUp(event: MouseEvent) {
		if (this.gameIndex !== Game.nextGameIndex - 1) return;

		if (event.button === 0) {
			this.leftMouseDown = false;
		} else if (event.button === 2) {
			this.rightMouseDown = false;
		}
	}

	public getShoot() {
		return this.shoot && (this.localPlayer.inventory[this.localPlayer.heldItemIndex]?.durability ?? 0) > 0; // only shoot if item has durability
	}

	public getAim() {
		return this.aim;
	}

	public getGamepadInputs(): GamepadInputs {
		return this.gamepadInputs;
	}

	public deregisterAllKeys() {
		const locked = document.pointerLockElement === document.body;
		if (!locked) {
			this.keys = {};
		}
	}

	public getInputX() {
		return this.inputX;
	}

	public getInputZ() {
		return this.inputZ;
	}

	private static approachZero(input: number, step: number): number {
		if (input == 0) return 0;
		let sign: number = 1;
		if (input < 0) sign = -1;
		const output: number = Math.abs(input) - step;
		if (output <= 0) return 0;
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
		this.gamepadInputs.leftShoulder = gamepad.buttons[4].pressed;
		this.gamepadInputs.rightShoulder = gamepad.buttons[5].pressed;
	}

	private calculateAimAssist(): number {
		// if (this.gamepad) {
		// 	if ((Math.abs(this.gamepadInputs.rightJoyX) >= .1 || Math.abs(this.gamepadInputs.rightJoyY) >= .1)) {
		// 		if (this.renderer.getPlayerSpheresInCrosshairWithWalls().length > 0) {
		// 			return .5;
		// 		}
		// 	}
		// } else if (
		// 	this.getKey('arrowup') || this.getKey('arrowdown') || this.getKey('arrowleft') || this.getKey('arrowright')
		// ) {
		// 	if (this.renderer.getPlayerSpheresInCrosshairWithWalls().length > 0) {
		// 		return .5;
		// 	}
		// }
		return 1;
	}
}

class GamepadInputs {
	leftJoyX: number = 0;
	leftJoyY: number = 0;
	rightJoyX: number = 0;
	rightJoyY: number = 0;
	leftTrigger: number = 0;
	rightTrigger: number = 0;
	leftShoulder: boolean = false;
	rightShoulder: boolean = false;
	A: boolean = false;
	B: boolean = false;
	X: boolean = false;
	Y: boolean = false;
}
