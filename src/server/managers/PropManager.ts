import { Prop, PropData } from '../../shared/Prop.ts';
import * as THREE from 'three';
import { MapData } from '../models/MapData.ts'; // For THREE.Vector3 etc. if used in methods

export class PropManager {
	private props: Map<number, Prop> = new Map();
	public hasUpdates: boolean = false;
	private mapData: MapData;

	constructor(mapData: MapData) {
		this.mapData = mapData;
	}

	public onTick(_deltaTime: number) {
	}

	public addProp(
		url: string,
		position: THREE.Vector3,
		quaternion: THREE.Quaternion = new THREE.Quaternion(),
		scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
	): Prop {
		const prop = new Prop(url, position, quaternion, scale);
		this.props.set(prop.id, prop);
		this.hasUpdates = true;
		console.log(`📦 [Server] Prop added: ID ${prop.id}, URL ${url}`);
		return prop;
	}

	public removeProp(id: number): boolean {
		const success = this.props.delete(id);
		if (success) {
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

	public clearUpdatesFlag(): void {
		this.hasUpdates = false;
	}
}
