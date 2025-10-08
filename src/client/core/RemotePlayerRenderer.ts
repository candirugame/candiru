import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { Player, PlayerData } from '../../shared/Player.ts';
import { ShotHandler, ShotParticleType } from './ShotHandler.ts';
import { ChatOverlay } from '../ui/ChatOverlay.ts';
import { SpriteManager } from '../ui/SpriteManager.ts';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

interface PlayerToRender {
	id: number;
	object: THREE.Object3D;
	objectUUID: string;
	sphere: THREE.Mesh;
	nameLabel: THREE.Sprite;
	name: string;
}

interface WeaponProperties {
	firingDelay: number;
	particleType: ShotParticleType;
	numberOfProjectiles: number;
	yawOffsetRange: number;
	pitchOffsetRange: number;
	// muzzleOffset?: THREE.Vector3; // Optional: if needed later
}

const weaponData: Map<number, WeaponProperties> = new Map([
	[1, { // BananaGun ID (Pistol)
		firingDelay: 0.225,
		particleType: ShotParticleType.Pistol,
		numberOfProjectiles: 1,
		yawOffsetRange: 0,
		pitchOffsetRange: 0,
	}],
	[2, { // FishGun ID (Shotgun)
		firingDelay: 0.45,
		particleType: ShotParticleType.Shotgun,
		numberOfProjectiles: 25,
		yawOffsetRange: 0.3,
		pitchOffsetRange: 0.3,
	}],
	[5, { // Sniper
		firingDelay: 0.5,
		particleType: ShotParticleType.Sniper,
		numberOfProjectiles: 1,
		yawOffsetRange: 0,
		pitchOffsetRange: 0,
	}],
	// Pipe (ID 3) doesn't shoot particles.
	// Flag (ID 4) doesn't shoot.
]);

export class RemotePlayerRenderer {
	private entityScene: THREE.Scene;
	private playersToRender: PlayerToRender[];
	private possumMesh: THREE.Mesh | undefined;
	private loader: GLTFLoader;
	private dracoLoader: DRACOLoader;

	private sphere: THREE.Mesh;
	private sphereScene: THREE.Scene;

	private raycaster: THREE.Raycaster;
	private camera: THREE.Camera;
	private scene: THREE.Scene;

	private isAnimating: { [id: number]: boolean };
	private animationPhase: { [id: number]: number };
	private previousVelocity: { [id: number]: number };
	private lastRunningYOffset: { [id: number]: number };

	private groundTruthPositions: { [id: number]: THREE.Vector3 };

	private lastFiredTime: { [id: number]: number };
	private wasShooting: { [id: number]: boolean };
	private lastAppliedHealthColor: { [id: number]: string };

	private networking: Networking;
	private localPlayer: Player;
	private shotHandler!: ShotHandler;
	private deltaTime: number = 0;
	private static minVelocityToAnimate = 0.1;
	private static map: THREE.Mesh = new THREE.Mesh();

	private crosshairVec = new THREE.Vector2();
	private spriteManager: SpriteManager;

	constructor(
		networking: Networking,
		localPlayer: Player,
		raycaster: THREE.Raycaster,
		camera: THREE.Camera,
		scene: THREE.Scene,
	) {
		this.networking = networking;
		this.localPlayer = localPlayer;
		this.raycaster = raycaster;
		this.camera = camera;
		this.scene = scene;

		this.entityScene = new THREE.Scene();

		this.sphere = new THREE.Mesh(new THREE.SphereGeometry(.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
		this.sphere.geometry.computeBoundsTree();
		this.sphereScene = new THREE.Scene();

		this.loader = new GLTFLoader();
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('/draco/');
		this.loader.setDRACOLoader(this.dracoLoader);

		this.spriteManager = new SpriteManager();

		this.possumMesh = undefined;
		this.loader.load(
			'models/simplified_possum.glb',
			(gltf: GLTF) => {
				console.time('Computing possum BVH');
				(<THREE.Mesh> gltf.scene.children[0]).geometry.computeBoundsTree();
				console.timeEnd('Computing possum BVH');
				this.possumMesh = <THREE.Mesh> gltf.scene.children[0];
			},
			undefined,
			() => {
				console.log('possum loading error');
			},
		);

		this.playersToRender = [];

		this.isAnimating = {};
		this.animationPhase = {};
		this.previousVelocity = {};
		this.lastRunningYOffset = {};

		this.groundTruthPositions = {};

		this.lastFiredTime = {};
		this.wasShooting = {};
		this.lastAppliedHealthColor = {};
	}

	public setShotHandler(shotHandler: ShotHandler) {
		this.shotHandler = shotHandler;
	}

	public getEntityScene(): THREE.Scene {
		return this.entityScene;
	}

	public destroy() {
		this.entityScene.clear();
		this.sphereScene.clear();
		this.playersToRender.forEach((player) => {
			this.entityScene.remove(player.object);
			this.entityScene.remove(player.nameLabel);
			this.sphereScene.remove(player.sphere);
		});
	}

	public onFrame(deltaTime: number): void {
		this.deltaTime = deltaTime;
		this.updateRemotePlayers();
	}

	private updateRemotePlayers(): void {
		if (!this.possumMesh) return;
		const currentTime = Date.now() / 1000;

		const remotePlayerData: PlayerData[] = this.networking.getRemotePlayerData();
		const localPlayerId = this.localPlayer.id;

		const currentPlayerIds = new Set(this.playersToRender.map((p) => p.id));

		remotePlayerData.forEach((remotePlayer) => {
			if (
				remotePlayer.id === localPlayerId ||
				remotePlayer.id === this.localPlayer.playerSpectating ||
				remotePlayer.playerSpectating !== -1
			) {
				if (currentPlayerIds.has(remotePlayer.id)) {
					delete this.lastFiredTime[remotePlayer.id];
					delete this.wasShooting[remotePlayer.id];
				}
				return;
			}

			const playerDataWithQuaternion: PlayerData = {
				...remotePlayer,
				lookQuaternion: remotePlayer.lookQuaternion || { x: 0, y: 0, z: 0, w: 1 },
			};

			const existingPlayer = this.playersToRender.find((player) => player.id === remotePlayer.id);
			if (existingPlayer) {
				this.updatePlayerPosition(existingPlayer.object, existingPlayer.sphere, playerDataWithQuaternion);
				this.applyHealthIndicatorColor(
					existingPlayer.object,
					this.normalizeHealthIndicatorColor(remotePlayer.healthIndicatorColor),
					remotePlayer.id,
				);
			} else {
				this.addNewPlayer(playerDataWithQuaternion);
				this.lastFiredTime[remotePlayer.id] = 0;
				this.wasShooting[remotePlayer.id] = false;
			}
		});

		const activeRemotePlayerIds = new Set(
			remotePlayerData
				.filter((rp) =>
					rp.id !== localPlayerId && rp.id !== this.localPlayer.playerSpectating && rp.playerSpectating === -1
				)
				.map((rp) => rp.id),
		);

		this.playersToRender = this.playersToRender.filter((player) => {
			const shouldKeep = activeRemotePlayerIds.has(player.id);
			if (!shouldKeep) {
				this.entityScene.remove(player.object);
				this.entityScene.remove(player.nameLabel);
				this.sphereScene.remove(player.sphere);

				delete this.groundTruthPositions[player.id];
				delete this.isAnimating[player.id];
				delete this.animationPhase[player.id];
				delete this.previousVelocity[player.id];
				delete this.lastRunningYOffset[player.id];
				delete this.lastFiredTime[player.id];
				delete this.wasShooting[player.id];
				delete this.lastAppliedHealthColor[player.id];
			}
			return shouldKeep;
		});

		remotePlayerData.forEach((remotePlayer) => {
			if (
				remotePlayer.id === localPlayerId ||
				remotePlayer.id === this.localPlayer.playerSpectating ||
				remotePlayer.playerSpectating !== -1 ||
				!this.playersToRender.some((p) => p.id === remotePlayer.id)
			) {
				return;
			}

			const playerId = remotePlayer.id;
			const heldItemObj = remotePlayer.inventory[remotePlayer.heldItemIndex];
			const weaponProps = heldItemObj ? weaponData.get(heldItemObj.itemId) : undefined;

			const playerObject = this.playersToRender.find((p) => p.id === playerId)?.object;
			const lookQuat = remotePlayer.lookQuaternion
				? new THREE.Quaternion(
					remotePlayer.lookQuaternion.x,
					remotePlayer.lookQuaternion.y,
					remotePlayer.lookQuaternion.z,
					remotePlayer.lookQuaternion.w,
				)
				: new THREE.Quaternion();

			if (weaponProps && playerObject && remotePlayer.shooting !== undefined) {
				const isCurrentlyShooting = remotePlayer.shooting;
				const timeSinceLastFire = currentTime - (this.lastFiredTime[playerId] ?? 0);

				const requiredDelay = weaponProps.firingDelay;

				if (isCurrentlyShooting && timeSinceLastFire >= requiredDelay) {
					this.lastFiredTime[playerId] = currentTime;

					const direction = new THREE.Vector3(0, 0, -1);
					direction.applyQuaternion(lookQuat);
					direction.normalize();

					const origin = playerObject.position.clone().add(direction.clone().multiplyScalar(0.5));
					origin.y += this.lastRunningYOffset[playerId] ?? 0;

					this.shotHandler.addShotGroup(
						0,
						weaponProps.numberOfProjectiles,
						150,
						weaponProps.yawOffsetRange,
						weaponProps.pitchOffsetRange,
						Infinity,
						false,
						weaponProps.particleType,
						origin,
						direction,
						false,
					);
				}

				this.wasShooting[playerId] = isCurrentlyShooting;
			} else {
				this.wasShooting[playerId] = false;
			}
		});
	}

	private updatePlayerPosition(
		playerObject: THREE.Object3D,
		playerSphere: THREE.Object3D,
		remotePlayerData: PlayerData,
	): void {
		const velocity = Math.sqrt(
			Math.pow(remotePlayerData.velocity.x, 2) +
				Math.pow(remotePlayerData.velocity.y, 2) +
				Math.pow(remotePlayerData.velocity.z, 2),
		);

		const playerId = remotePlayerData.id;
		const prevVelocity = this.previousVelocity[playerId] || 0;

		if (
			prevVelocity <= RemotePlayerRenderer.minVelocityToAnimate && velocity > RemotePlayerRenderer.minVelocityToAnimate
		) {
			this.isAnimating[playerId] = true;
			this.animationPhase[playerId] = 0;
		}

		this.previousVelocity[playerId] = velocity;

		if (!this.groundTruthPositions[playerId]) {
			this.groundTruthPositions[playerId] = new THREE.Vector3(
				remotePlayerData.position.x,
				remotePlayerData.position.y,
				remotePlayerData.position.z,
			);
		}

		const groundTruthPosition = this.groundTruthPositions[playerId];

		groundTruthPosition.x += remotePlayerData.velocity.x * this.deltaTime;
		groundTruthPosition.y += remotePlayerData.velocity.y * this.deltaTime;
		groundTruthPosition.z += remotePlayerData.velocity.z * this.deltaTime;

		if (remotePlayerData.forced) {
			groundTruthPosition.set(
				remotePlayerData.position.x,
				remotePlayerData.position.y,
				remotePlayerData.position.z,
			);
		}

		groundTruthPosition.lerp(
			new THREE.Vector3(
				remotePlayerData.position.x,
				remotePlayerData.position.y,
				remotePlayerData.position.z,
			),
			0.1 * this.deltaTime * 60,
		);

		playerObject.position.copy(groundTruthPosition);
		playerSphere.position.copy(groundTruthPosition.clone());

		if (this.isAnimating[playerId]) {
			const frequency = 25;
			this.animationPhase[playerId] += this.deltaTime * frequency;

			const amplitude = 0.08;
			const yOffset = amplitude * (1 + Math.cos(this.animationPhase[playerId]));

			playerObject.position.y += yOffset;
			playerSphere.position.y += yOffset;
			this.lastRunningYOffset[playerId] = yOffset;

			if (velocity <= RemotePlayerRenderer.minVelocityToAnimate && Math.cos(this.animationPhase[playerId]) <= 0) {
				this.isAnimating[playerId] = false;
				this.lastRunningYOffset[playerId] = 0;
			}
		} else {
			this.lastRunningYOffset[playerId] = 0;
		}

		playerObject.position.x += (Math.random() - 0.5) * 0.05 *
			(1 - Math.pow(remotePlayerData.health / this.networking.getServerInfo().playerMaxHealth, 2));
		playerObject.position.y += (Math.random() - 0.5) * 0.05 *
			(1 - Math.pow(remotePlayerData.health / this.networking.getServerInfo().playerMaxHealth, 2));
		playerObject.position.z += (Math.random() - 0.5) * 0.05 *
			(1 - Math.pow(remotePlayerData.health / this.networking.getServerInfo().playerMaxHealth, 2));

		const euler = new THREE.Euler().setFromQuaternion(
			new THREE.Quaternion(
				remotePlayerData.lookQuaternion.x,
				remotePlayerData.lookQuaternion.y,
				remotePlayerData.lookQuaternion.z,
				remotePlayerData.lookQuaternion.w,
			),
			'YXZ',
		);
		euler.x = 0;
		euler.z = 0;
		const targetQuaternion = new THREE.Quaternion().setFromEuler(euler);

		// const targetQuaternion = new THREE.Quaternion(
		// 	remotePlayerData.quaternion.x,
		// 	remotePlayerData.quaternion.y,
		// 	remotePlayerData.quaternion.z,
		// 	remotePlayerData.quaternion.w,
		// );
		const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
		targetQuaternion.multiply(rotationQuaternion);

		playerObject.quaternion.slerp(targetQuaternion, 0.5 * this.deltaTime * 60);

		const player = this.playersToRender.find((p) => p.id === remotePlayerData.id);
		if (player) {
			player.nameLabel.position.set(
				playerObject.position.x,
				playerObject.position.y + 0.40,
				playerObject.position.z,
			);
			player.nameLabel.lookAt(this.camera.position);

			if (player.name !== remotePlayerData.name) {
				player.name = remotePlayerData.name;
				this.entityScene.remove(player.nameLabel);
				player.nameLabel = this.createTextSprite(remotePlayerData.name.toString());
				player.nameLabel.position.set(
					playerObject.position.x,
					playerObject.position.y + 0.40,
					playerObject.position.z,
				);
				this.entityScene.add(player.nameLabel);
			}
		}
	}

	private addNewPlayer(remotePlayerData: PlayerData): void {
		const object = this.possumMesh!.clone();
		this.ensureUniqueMaterials(object);
		const sphere = this.sphere.clone();

		const nameLabel = this.createTextSprite(remotePlayerData.name.toString());

		const newPlayer: PlayerToRender = {
			id: remotePlayerData.id,
			object: object,
			objectUUID: object.uuid,
			sphere: sphere,
			nameLabel: nameLabel,
			name: remotePlayerData.name,
		};

		this.playersToRender.push(newPlayer);
		this.entityScene.add(newPlayer.object);
		this.sphereScene.add(newPlayer.sphere);
		this.entityScene.add(newPlayer.nameLabel);
		this.applyHealthIndicatorColor(
			newPlayer.object,
			this.normalizeHealthIndicatorColor(remotePlayerData.healthIndicatorColor),
			remotePlayerData.id,
		);

		this.groundTruthPositions[remotePlayerData.id] = new THREE.Vector3(
			remotePlayerData.position.x,
			remotePlayerData.position.y,
			remotePlayerData.position.z,
		);
		this.lastFiredTime[remotePlayerData.id] = 0;
		this.wasShooting[remotePlayerData.id] = false;
	}

	private ensureUniqueMaterials(object: THREE.Object3D): void {
		object.traverse((child) => {
			const mesh = child as THREE.Mesh;
			if (!mesh || !mesh.isMesh) return;
			if (Array.isArray(mesh.material)) {
				mesh.material = mesh.material.map((material: THREE.Material) => material.clone());
			} else if (mesh.material) {
				mesh.material = mesh.material.clone();
			}
		});
	}

	private normalizeHealthIndicatorColor(
		color: PlayerData['healthIndicatorColor'],
	): [number, number, number] {
		const [r = 255, g = 255, b = 255] = color;
		return [r, g, b];
	}

	private applyHealthIndicatorColor(
		object: THREE.Object3D,
		color: [number, number, number],
		playerId: number,
	): void {
		const key = `${color[0]}_${color[1]}_${color[2]}`;
		if (this.lastAppliedHealthColor[playerId] === key) return;

		const r = THREE.MathUtils.clamp(color[0] / 255, 0, 1);
		const g = THREE.MathUtils.clamp(color[1] / 255, 0, 1);
		const b = THREE.MathUtils.clamp(color[2] / 255, 0, 1);

		object.traverse((child) => {
			const mesh = child as THREE.Mesh;
			if (!mesh || !mesh.isMesh) return;
			const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			for (const material of materials) {
				if (material && 'color' in material && material.color instanceof THREE.Color) {
					material.color.setRGB(r, g, b);
				}
			}
		});

		this.lastAppliedHealthColor[playerId] = key;
	}

	private removeInactivePlayers(remotePlayerData: PlayerData[]): void {
		this.playersToRender = this.playersToRender.filter((player) => {
			const isActive = remotePlayerData.some((remotePlayer) => remotePlayer.id === player.id);
			if (!isActive) {
				this.entityScene.remove(player.object);
				this.entityScene.remove(player.nameLabel);
				this.sphereScene.remove(player.sphere);
				delete this.groundTruthPositions[player.id];
				delete this.isAnimating[player.id];
				delete this.animationPhase[player.id];
				delete this.previousVelocity[player.id];
				delete this.lastRunningYOffset[player.id];
				delete this.lastFiredTime[player.id];
				delete this.wasShooting[player.id];
				delete this.lastAppliedHealthColor[player.id];
			}
			return isActive;
		});
	}

	private getColorCode(code: string): string | false {
		if (code === 'g') {
			return this.getRainbowColor();
		}
		return ChatOverlay.COLOR_CODES[code] || false;
	}

	private getRainbowColor(): string {
		const hue = (Date.now() / 20) % 360;
		return `hsl(${hue}, 100%, 50%)`;
	}

	private createTextSprite(text: string): THREE.Sprite {
		// Parse color codes and sprites, and calculate total width
		const fontSize = 64;
		const context = document.createElement('canvas').getContext('2d')!;
		context.font = `${fontSize}px Comic Sans MS`;

		// Split text into segments (text and sprites)
		const segments: { type: 'text' | 'sprite'; content: string; color?: string; width: number }[] = [];
		let currentColor = '#FFFFFF';
		let currentSegment = '';
		let totalWidth = 0;

		const pushTextSegment = () => {
			if (currentSegment) {
				const width = context.measureText(currentSegment).width;
				segments.push({ type: 'text', content: currentSegment, color: currentColor, width });
				totalWidth += width;
				currentSegment = '';
			}
		};

		for (let i = 0; i < text.length; i++) {
			// Check for color codes
			if (text[i] === '&' && i + 1 < text.length && this.getColorCode(text[i + 1])) {
				pushTextSegment();
				currentColor = <string> this.getColorCode(text[i + 1]);
				i++; // Skip the color code character
			} // Check for sprite codes
			else if (text[i] === '^' && i + 1 < text.length && ChatOverlay.SPRITE_CODES[text[i + 1]]) {
				pushTextSegment();
				const spriteName = ChatOverlay.SPRITE_CODES[text[i + 1]];
				// Sprites have a fixed width in the texture (convert to fontSize scale)
				const spriteWidth = (8 / 8) * fontSize; // 8px sprite scaled to fontSize
				segments.push({ type: 'sprite', content: spriteName, width: spriteWidth });
				totalWidth += spriteWidth;
				i++; // Skip the sprite code character
			} // Handle regular characters
			else {
				currentSegment += text[i];
			}
		}
		pushTextSegment();

		// Create canvas
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;
		canvas.width = totalWidth * 2; // Match original 2x scaling
		canvas.height = fontSize * 2;

		// Draw centered content
		let xPos = (canvas.width - totalWidth) / 2;
		ctx.textBaseline = 'middle';

		segments.forEach((segment) => {
			if (segment.type === 'text') {
				ctx.fillStyle = segment.color!;
				ctx.font = `${fontSize}px Comic Sans MS`;
				ctx.fillText(segment.content, xPos, canvas.height / 2);
			} else if (segment.type === 'sprite') {
				// Render sprite to the canvas
				// Scale sprite to match font size (sprite is 8px, fontSize is 64px)
				this.spriteManager.renderSprite(
					ctx,
					segment.content,
					xPos,
					canvas.height / 2 - (fontSize / 2), // Center vertically
					segment.width, // Width scaled down by 2x factor
					fontSize, // Height to match font size
				);
			}
			xPos += segment.width;
		});

		// Create sprite
		const texture = new THREE.CanvasTexture(canvas);
		const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
		const sprite = new THREE.Sprite(spriteMaterial);

		// Match original scaling calculation
		sprite.scale.set((totalWidth / fontSize) * 0.4, 0.4, 0.4);

		return sprite;
	}

	public getRemotePlayerIDsInCrosshair(): number[] {
		const shotVectors = this.getShotVectorsToPlayersInCrosshair();
		const playerIDs = shotVectors.map((shot) => shot.playerID);
		return playerIDs;
	}

	public getShotVectorsToPlayersInCrosshair(
		maxDistance: number | undefined = undefined,
	): { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		const shotVectors: { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] = [];
		const objectsInCrosshair = this.getPlayersInCrosshairWithWalls(maxDistance);

		for (const object of objectsInCrosshair) {
			for (const player of this.playersToRender) {
				if (player.objectUUID === object.uuid) {
					const intersection = this.findIntersectionOnPlayer(object);
					if (intersection) {
						const vector = new THREE.Vector3().subVectors(intersection.point, this.camera.position);
						const hitPoint = intersection.point.clone();
						shotVectors.push({ playerID: player.id, vector, hitPoint });
					}
					break;
				}
			}
		}

		return shotVectors;
	}

	private findIntersectionOnPlayer(playerObject: THREE.Object3D): THREE.Intersection | null {
		this.raycaster.setFromCamera(this.crosshairVec, this.camera);

		const intersects = this.raycaster.intersectObject(playerObject, true);
		if (intersects.length > 0) {
			return intersects[0];
		}
		return null;
	}

	private getPlayersInCrosshairWithWalls(maxDistance: number | undefined = undefined): THREE.Object3D[] {
		this.raycaster.setFromCamera(this.crosshairVec, this.camera);

		const playerIntersects = this.raycaster.intersectObjects(this.entityScene.children);
		this.raycaster.firstHitOnly = true;
		const wallIntersects = this.raycaster.intersectObjects([RemotePlayerRenderer.map]);
		this.raycaster.firstHitOnly = false;

		const filteredIntersects = playerIntersects.filter((playerIntersect: THREE.Intersection) => {
			for (const wallIntersect of wallIntersects) {
				if (wallIntersect.distance < playerIntersect.distance) {
					return false;
				}
				if (maxDistance) {
					if (playerIntersect.distance > maxDistance) return false;
				}
			}
			return true;
		});

		return filteredIntersects.map((intersect: THREE.Intersection) => intersect.object);
	}

	public getPlayerSpheresInCrosshairWithWalls(): THREE.Object3D[] {
		this.raycaster.setFromCamera(this.crosshairVec, this.camera);

		this.sphereScene.updateMatrixWorld();

		this.raycaster.firstHitOnly = true;
		const playerIntersects = this.raycaster.intersectObjects(this.sphereScene.children);
		const wallIntersects = this.raycaster.intersectObjects([RemotePlayerRenderer.map]);
		this.raycaster.firstHitOnly = false;

		const filteredIntersects = playerIntersects.filter((playerIntersect: THREE.Intersection) => {
			for (const wallIntersect of wallIntersects) {
				if (wallIntersect.distance < playerIntersect.distance) {
					return false;
				}
			}
			return true;
		});

		return filteredIntersects.map((intersect: THREE.Intersection) => intersect.object);
	}

	public getShotVectorsToPlayersWithOffset(
		yawOffset: number,
		pitchOffset: number,
		maxDistance: number,
	): { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		const shotVectors: { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] = [];
		const offsetDirection = this.calculateOffsetDirection(yawOffset, pitchOffset);

		this.raycaster.set(this.camera.position, offsetDirection);

		const playerIntersects = this.raycaster.intersectObjects(this.playersToRender.map((p) => p.object), true);
		this.raycaster.firstHitOnly = true;
		const wallIntersects = this.raycaster.intersectObjects([RemotePlayerRenderer.map]);
		this.raycaster.firstHitOnly = false;

		const filteredPlayerIntersects = playerIntersects.filter((playerIntersect: THREE.Intersection) => {
			for (const wallIntersect of wallIntersects) {
				if (wallIntersect.distance < playerIntersect.distance) {
					return false;
				}
				if (playerIntersect.distance > maxDistance) {
					return false;
				}
			}
			return true;
		});

		for (const intersect of filteredPlayerIntersects) {
			const player = this.playersToRender.find((p) => p.object === intersect.object);
			if (player) {
				const vector = new THREE.Vector3().subVectors(intersect.point, this.camera.position);
				const hitPoint = intersect.point.clone();
				shotVectors.push({ playerID: player.id, vector, hitPoint });
			}
		}

		return shotVectors;
	}

	private calculateOffsetDirection(yawOffset: number, pitchOffset: number): THREE.Vector3 {
		const direction = new THREE.Vector3();
		this.camera.getWorldDirection(direction);

		const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);
		const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchOffset);

		direction.applyQuaternion(yawQuaternion);
		direction.applyQuaternion(pitchQuaternion);

		return direction.normalize();
	}

	private findIntersectionOnPlayerWithOffset(
		playerObject: THREE.Object3D,
		offsetDirection: THREE.Vector3,
	): THREE.Intersection | null {
		this.raycaster.set(this.camera.position, offsetDirection);

		const intersects = this.raycaster.intersectObject(playerObject, true);
		if (intersects.length > 0) {
			return intersects[0];
		}
		return null;
	}

	public static setMap(map: THREE.Mesh) {
		this.map = map;
	}

	public static getMap(): THREE.Mesh {
		return this.map;
	}
}
