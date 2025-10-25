import { Prop, PropData } from '../../shared/Prop.ts';
import * as THREE from 'three';
import { PropDamageRequest } from '../models/PropDamageRequest.ts';
import { PhysicsEngine } from '../physics/PhysicsEngine.ts';
import type { PropSpawn } from '../models/MapData.ts';
import { PlayerManager } from './PlayerManager.ts';

type PropInitOptions = {
	name?: string;
	doPhysics?: boolean;
	playersCollide?: boolean;
	health?: number;
	velocity?: THREE.Vector3;
	angularVelocity?: THREE.Vector3;
};

const PROP_SHOT_BASE_IMPULSE = 0;
const PROP_SHOT_DAMAGE_MULTIPLIER = 0.05;
const PROP_SHOT_VERTICAL_BOOST = 0.01;

const PROP_PLAYER_REPEL_RADIUS = 0.75;
const PROP_PLAYER_REPEL_STRENGTH = 0.2;
const PROP_PLAYER_REPEL_VERTICAL_BIAS = 0;

export class PropManager {
	private props: Map<number, Prop> = new Map();
	public hasUpdates: boolean = false; //triggers an early full data broadcast.. mostly for when adding and deleting props

	//	public testProp!: Prop;

	constructor(private physics: PhysicsEngine, private playerManager: PlayerManager) {
		// this.testProp = this.addProp('models/hexagon.glb', new THREE.Vector3(0, 0.5, 0));
		// this.addProp('models/hexagon.glb', new THREE.Vector3(0, 10, 0));
	}

	public onTick(deltaTime: number) {
		this.applyPlayerRepulsion();
		this.physics.step(deltaTime);
	}

	public async addProp(
		url: string,
		position: THREE.Vector3,
		quaternion: THREE.Quaternion = new THREE.Quaternion(),
		scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
		options: PropInitOptions = {},
	): Promise<Prop> {
		const prop = new Prop(url, position, quaternion, scale);
		if (options.name !== undefined) prop.name = options.name;
		if (options.doPhysics !== undefined) prop.doPhysics = options.doPhysics;
		if (options.playersCollide !== undefined) prop.playersCollide = options.playersCollide;
		if (options.health !== undefined) prop.health = options.health;
		if (options.velocity) prop.velocity.copy(options.velocity);
		if (options.angularVelocity) prop.angularVelocity.copy(options.angularVelocity);

		this.props.set(prop.id, prop);
		this.hasUpdates = true;
		try {
			await this.physics.registerProp(prop);
		} catch (error) {
			console.error(`⚠️ [Server] Failed to register physics for prop ${prop.id}:`, error);
		}
		console.log(`📦 [Server] Prop added: ID ${prop.id}, URL ${url}`);
		return prop;
	}

	public handleDamageRequest(data: PropDamageRequest) {
		const prop = this.props.get(data.targetPropID);
		if (!prop) {
			console.log(`⚠️ [Server] Prop not found for damage request: ID ${data.targetPropID}`);
			return;
		}

		if (prop.health !== undefined) {
			prop.health -= data.damage;
			console.log(`💥 [Server] Prop damaged: ID ${data.targetPropID}, Health ${prop.health}`);
			if (prop.health <= 0) {
				this.removeProp(data.targetPropID);
			}
		}

		this.applyShotImpulse(prop, data.playerID, data.damage);
	}

	public removeProp(id: number): boolean {
		const success = this.props.delete(id);
		if (success) {
			this.physics.removeProp(id);
			this.hasUpdates = true;
			console.log(`🗑️ [Server] Prop removed: ID ${id}`);
		}
		return success;
	}

	public getPropById(id: number): Prop | undefined {
		return this.props.get(id);
	}

	public getAllPropsData(): PropData[] {
		return Array.from(this.props.values()).map((prop) => prop.toJSON());
	}

	public getPropCount(): number {
		return this.props.size;
	}

	public clearUpdatesFlag(): void {
		this.hasUpdates = false;
	}

	public async loadInitialProps(spawns: PropSpawn[]): Promise<void> {
		if (!spawns.length) return;
		await Promise.all(
			spawns.map(async (spawn) => {
				const options: PropInitOptions = {
					name: spawn.name,
					doPhysics: spawn.doPhysics,
					playersCollide: spawn.playersCollide,
					health: spawn.health,
					velocity: spawn.velocity?.clone(),
					angularVelocity: spawn.angularVelocity?.clone(),
				};
				await this.addProp(
					spawn.url,
					spawn.position.clone(),
					spawn.quaternion.clone(),
					spawn.scale.clone(),
					options,
				);
			}),
		);
	}

	private applyShotImpulse(prop: Prop, playerId: number, damage: number): void {
		if (!prop.doPhysics) return;

		const impulseDir = this.getShotDirection(playerId);
		if (impulseDir.lengthSq() === 0) return;

		const magnitude = PROP_SHOT_BASE_IMPULSE + Math.max(0, damage) * PROP_SHOT_DAMAGE_MULTIPLIER;
		const impulse = impulseDir.multiplyScalar(magnitude);
		impulse.y += PROP_SHOT_VERTICAL_BOOST;

		this.physics.applyImpulse(prop.id, impulse);
		this.hasUpdates = true;
	}

	private getShotDirection(playerId: number): THREE.Vector3 {
		const player = this.playerManager.getPlayerById(playerId);
		if (!player) return new THREE.Vector3(0, 0, -1);
		const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.lookQuaternion);
		if (forward.lengthSq() === 0) {
			return new THREE.Vector3(0, 0, -1);
		}
		return forward.normalize();
	}

	private applyPlayerRepulsion(): void {
		const players = this.playerManager.getAllPlayers();
		if (!players.length) return;

		const impulseAccumulator = new THREE.Vector3();
		const directionBuffer = new THREE.Vector3();

		for (const prop of this.props.values()) {
			if (!prop.doPhysics) continue;

			let hasImpulse = false;
			impulseAccumulator.set(0, 0, 0);

			for (const player of players) {
				directionBuffer.copy(prop.position).sub(player.position);
				const distance = directionBuffer.length();
				if (distance === 0 || distance > PROP_PLAYER_REPEL_RADIUS) continue;

				const falloff = 1 - distance / PROP_PLAYER_REPEL_RADIUS;
				directionBuffer.normalize();
				impulseAccumulator.addScaledVector(directionBuffer, PROP_PLAYER_REPEL_STRENGTH * falloff);
				impulseAccumulator.y += PROP_PLAYER_REPEL_VERTICAL_BIAS * falloff;
				hasImpulse = true;
			}

			if (hasImpulse && impulseAccumulator.lengthSq() > 0) {
				this.physics.applyImpulse(prop.id, impulseAccumulator);
				this.hasUpdates = true;
			}
		}
	}
}
