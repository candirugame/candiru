import { ItemBase, ItemType } from './ItemBase.ts';
import { HeldItemInput } from '../input/HeldItemInput.ts';
import * as THREE from 'three';
import { Renderer } from '../core/Renderer.ts';
import { Networking } from '../core/Networking.ts';
import { AssetManager } from '../core/AssetManager.ts';
import { InputHandler } from '../input/InputHandler.ts';

const firingDelay = 2;
const firingDelayHeld = 2; //longer firing delay when mouse is held down
const showInHandDelay = 0.5;

const scopedPosition = new THREE.Vector3(0, -0.6, 3.5);
const unscopedPosition = new THREE.Vector3(0.85, -0.8, 3.2);
const hiddenPosition = new THREE.Vector3(0.85, -2.7, 3.2);
const unscopedQuaternion = new THREE.Quaternion(0, 0, 0, 0);
const inventoryQuaternionBase = new THREE.Quaternion(0, 0, 0, 1);

export class BottleGun extends ItemBase {
	private renderer: Renderer;
	private networking: Networking;
	private lastInput: HeldItemInput;
	private lastFired: number = 0;
	private isZoomed: boolean = false;
	private addedToHandScene: boolean = false;
	private scopeOverlay: HTMLDivElement | null = null;
	private inputHandler: InputHandler;
	private scopeAnimationTimestamp: number = 0;
	private scopeAnimationDelay: number = 0.3;

	constructor(
		renderer: Renderer,
		networking: Networking,
		inputHandler: InputHandler,
		index: number,
		itemType: ItemType,
	) {
		const scene = itemType === ItemType.WorldItem ? renderer.getEntityScene() : renderer.getHeldItemScene();

		super(itemType, scene, renderer.getInventoryMenuScene(), index);

		this.renderer = renderer;
		this.networking = networking;
		this.lastInput = new HeldItemInput();
		this.inputHandler = inputHandler;
	}

	private createScopeOverlay(): void {
		const style = document.createElement('style');
		style.textContent = `
        .scope-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            display: none;
            z-index: 1000;
            image-rendering: pixelated;
        }

        .scope-viewport {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80vmin;
            height: 80vmin;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                transparent 0%,
                transparent 58%,
                rgba(0, 32, 0, 0.5) 60%,
                rgba(0, 32, 0, 0.5) 100%
            );
            box-shadow: 0 0 0 100vmax rgba(0, 32, 0, 0.5);
        }

        .scope-viewport svg {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            shape-rendering: crispEdges;
        }
    `;
		document.head.appendChild(style);

		// Generate random dust particles
		let dustParticles = '';
		for (let i = 0; i < 50; i++) {
			const x = Math.random() * 80 - 40;
			const y = Math.random() * 80 - 40;
			const size = Math.random() * 2 + 1;
			const opacity = Math.random() * 0.1;
			const grayValue = Math.floor(Math.random() * 255);
			dustParticles += `<rect x="${x}" y="${y}" width="${size}" height="${size}" 
                               fill="rgb(${grayValue},${grayValue},${grayValue})" 
                               opacity="${opacity}"/>`;
		}

		this.scopeOverlay = document.createElement('div');
		this.scopeOverlay.className = 'scope-overlay';
		this.scopeOverlay.innerHTML = `
        <div class="scope-viewport">
            <svg width="100%" height="100%" viewBox="-50 -50 100 100">
                <!-- Dust particles -->
                ${dustParticles}

                <!-- Outer markers -->
                <path d="M -40,0 L -35,0 M 35,0 L 40,0 M 0,-40 L 0,-35 M 0,35 L 0,40" 
                      stroke="rgba(0, 32, 0, 0.8)" 
                      stroke-width="0.5"/>

                <!-- Crosshair -->
                <line x1="-20" y1="0" x2="20" y2="0" 
                      stroke="rgba(0, 32, 0, 0.8)" 
                      stroke-width="0.5"
                      stroke-dasharray="2 2"/>
                <line x1="0" y1="-20" x2="0" y2="20" 
                      stroke="rgba(0, 32, 0, 0.8)" 
                      stroke-width="0.5"
                      stroke-dasharray="2 2"/>

                <!-- Small center circle -->
                <circle cx="0" cy="0" r="0.3" 
                        fill="rgba(255, 0, 0, 0.8)"
                        shape-rendering="auto"/>

                <!-- Corner markers -->
                <path d="M -25,-25 L -25,-22 L -22,-22 L -22,-25 Z 
                         M 22,-25 L 22,-22 L 25,-22 L 25,-25 Z
                         M -25,25 L -25,22 L -22,22 L -22,25 Z
                         M 22,25 L 22,22 L 25,22 L 25,25 Z" 
                      fill="rgba(0, 32, 0, 0.8)"/>
            </svg>
        </div>
    `;

		document.body.appendChild(this.scopeOverlay);
	}

	public override init() {
		AssetManager.getInstance().loadAsset('models/simplified_bottle.glb', (scene) => {
			this.object = scene;
			if (this.itemType === ItemType.InventoryItem) {
				this.object.scale.set(0.55, 0.55, 0.55);
				this.createScopeOverlay();
				this.object.traverse((child) => {
					if ((child as THREE.Mesh).isMesh) {
						child.renderOrder = 999;
						const mesh = child as THREE.Mesh;
						if (Array.isArray(mesh.material)) {
							mesh.material.forEach((mat) => mat.depthTest = false);
						} else {
							mesh.material.depthTest = false;
						}
					}
				});
			}

			this.inventoryMenuObject = this.object.clone();
			this.inventoryMenuObject.scale.set(0.3, 0.3, 0.3);

			if (this.itemType === ItemType.WorldItem) {
				this.object.scale.set(0.2, 0.2, 0.2);
				this.object.rotation.z = Math.PI / 2;
			}
			if (this.itemType === ItemType.InventoryItem) {
				this.object.scale.set(0.55, 0.55, 0.55);
			}
		});
	}

	public override onFrame(input: HeldItemInput, selectedIndex: number) {
		if (!this.object) return;
		const deltaTime = this.clock.getDelta();
		this.timeAccum += deltaTime;
		this.angleAccum += deltaTime;

		if (this.itemType === ItemType.WorldItem) {
			this.worldOnFrame(deltaTime);
		} else if (this.itemType === ItemType.InventoryItem) {
			this.inventoryOnFrame(deltaTime, selectedIndex);
			this.handOnFrame(deltaTime, input);
		}
	}

	// No need to override worldOnFrame if default behavior is sufficient
	// If specific behavior is needed, you can override it here

	public override inventoryOnFrame(deltaTime: number, selectedIndex: number) {
		if (!this.addedToInventoryItemScenes) {
			this.inventoryMenuScene.add(this.inventoryMenuObject);
			this.addedToInventoryItemScenes = true;
		}

		this.angleAccum += deltaTime;
		this.inventoryMenuObject.position.set(0, this.index, 0);

		const targetQuaternion = inventoryQuaternionBase.clone();
		if (this.index === selectedIndex) {
			rotateAroundWorldAxis(targetQuaternion, new THREE.Vector3(0, 1, 0), this.angleAccum * 4);
			this.showInHand();
		} else {
			this.hideInHand();
		}
		this.inventoryMenuObject.quaternion.slerp(targetQuaternion, 0.1 * 60 * deltaTime);
	}

	public override handOnFrame(deltaTime: number, input: HeldItemInput) {
		if (!this.object) return;
		this.inputHandler.setSensitivityMultiplier(1.5 / this.renderer.getHeldItemZoom()); //adjust sens

		if (this.shownInHand && !this.addedToHandScene) {
			this.scene.add(this.object);
			this.addedToHandScene = true;
		}

		if (this.shownInHand && Date.now() / 1000 - this.shownInHandTimestamp > showInHandDelay) {
			this.handleInput(input, deltaTime);
		} else {
			this.handPosition.lerp(hiddenPosition, 0.1 * 60 * deltaTime);
			this.object.position.copy(this.handPosition);
			// Remove the object after it has slid out of view
			if (this.handPosition.distanceTo(hiddenPosition) < 0.1) {
				if (this.addedToHandScene) {
					this.scene.remove(this.object);
					this.addedToHandScene = false;
				}
			}
		}

		// Update crosshair flashing based on last shot timestamp
		this.renderer.crosshairIsFlashing = Date.now() / 1000 - this.renderer.lastShotSomeoneTimestamp < 0.05;
	}

	private handleInput(input: HeldItemInput, deltaTime: number) {
		if (input.rightClick) {
			if (!this.isZoomed) {
				this.isZoomed = true;
				this.scopeAnimationTimestamp = Date.now() / 1000;
			}
			if (Date.now() / 1000 - this.scopeAnimationTimestamp > this.scopeAnimationDelay) {
				if (this.object) {
					this.object.visible = false;
				}
				// Show scope overlay after delay
				if (this.scopeOverlay) {
					this.scopeOverlay.style.display = 'block';
				}
				// Set zoom after delay
				this.renderer.setTargetHeldItemZoom(10);
			}

			moveTowardsPos(this.handPosition, scopedPosition, 0.3 * deltaTime * 60);
		} else {
			if (this.isZoomed) {
				this.isZoomed = false;
				if (this.scopeOverlay) {
					this.scopeOverlay.style.display = 'none';
				}
				if (this.object) {
					this.object.visible = true;
				}
				this.renderer.setTargetHeldItemZoom(1); // Reset zoom
			}
			moveTowardsPos(this.handPosition, unscopedPosition, 0.1 * deltaTime * 60);
		}
		this.object.position.copy(this.handPosition);
		//returns wep to original position
		moveTowardsRot(this.object.quaternion, unscopedQuaternion, 0.1 * deltaTime * 60);

		if (input.leftClick && (!this.lastInput.leftClick || Date.now() / 1000 - this.lastFired > firingDelayHeld)) {
			if (Date.now() / 1000 - this.lastFired > firingDelay) {
				this.lastFired = Date.now() / 1000;
				this.shootBottle();
				this.handPosition.add(new THREE.Vector3(0, 0, 0.6));
				rotateAroundWorldAxis(this.object.quaternion, new THREE.Vector3(1, 0, 0), Math.PI / 16);
			}
		}

		this.lastInput = input;
	}

	public override showInHand() {
		if (this.shownInHand) return;
		this.shownInHand = true;
		this.shownInHandTimestamp = Date.now() / 1000;
		if (!this.scopeOverlay && this.itemType === ItemType.InventoryItem) {
			this.createScopeOverlay();
		}
		if (!this.addedToHandScene && this.object) {
			this.scene.add(this.object);
			this.addedToHandScene = true;
		}
	}

	public override hideInHand() {
		if (!this.shownInHand) return;
		this.shownInHand = false;
		if (this.scopeOverlay) {
			this.scopeOverlay.style.display = 'none';
		}
	}

	public itemDepleted(): boolean {
		return false;
	}

	private shootBottle() {
		const processShots = () => {
			const shotVectors = this.renderer.getShotVectorsToPlayersInCrosshair();
			if (shotVectors.length > 0) {
				for (const shot of shotVectors) {
					const { playerID, hitPoint } = shot;
					if (Math.random() < 0.75) {
						this.networking.applyDamage(playerID, 83);
					} else {
						this.networking.applyDamage(playerID, 100);
					}
					this.renderer.playerHitMarkers.push({ hitPoint: hitPoint, shotVector: shot.vector, timestamp: -1 });
				}
				this.renderer.lastShotSomeoneTimestamp = Date.now() / 1000;
			}
		};

		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(processShots, { timeout: 150 });
		} else {
			setTimeout(processShots, 0);
		}
	}

	// Method to set world position when used as WorldItem
	public override setWorldPosition(vector: THREE.Vector3) {
		super.setWorldPosition(vector);
	}
}

function rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
	const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
	source.multiplyQuaternions(rotationQuat, source);
}

function moveTowardsPos(source: THREE.Vector3, target: THREE.Vector3, frac: number) {
	source.lerp(target, frac);
}

function moveTowardsRot(source: THREE.Quaternion, target: THREE.Quaternion, frac: number) {
	source.slerp(target, frac);
}
