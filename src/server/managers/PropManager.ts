import { Prop, PropData } from '../../shared/Prop.ts';
import * as THREE from 'three';
import { PropDamageRequest } from '../models/PropDamageRequest.ts';
import { PhysicsEngine } from '../physics/PhysicsEngine.ts';

export class PropManager {
	private props: Map<number, Prop> = new Map();
	public hasUpdates: boolean = false; //triggers an early full data broadcast.. mostly for when adding and deleting props

	//	public testProp!: Prop;

	constructor(private physics: PhysicsEngine) {
		// this.testProp = this.addProp('models/hexagon.glb', new THREE.Vector3(0, 0.5, 0));
		// this.addProp('models/hexagon.glb', new THREE.Vector3(0, 10, 0));
	}

	public onTick(deltaTime: number) {
		this.physics.step(deltaTime);
	}

	public async addProp(
		url: string,
		position: THREE.Vector3,
		quaternion: THREE.Quaternion = new THREE.Quaternion(),
		scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
	): Promise<Prop> {
		const prop = new Prop(url, position, quaternion, scale);
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
		if (prop && prop.health !== undefined) {
			prop.health -= data.damage;
			console.log(`💥 [Server] Prop damaged: ID ${data.targetPropID}, Health ${prop.health}`);
			if (prop.health <= 0) {
				this.removeProp(data.targetPropID);
			}
		} else {
			console.log(`⚠️ [Server] Prop not found for damage request: ID ${data.targetPropID}`);
		}
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
}
