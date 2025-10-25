import RAPIER from '@dimforge/rapier3d-compat';
import { NodeIO } from '@gltf-transform/core';
import {
	EXTTextureWebP,
	KHRDracoMeshCompression,
	KHRMaterialsSpecular,
	KHRTextureTransform,
} from '@gltf-transform/extensions';
import type { Mesh, Node } from '@gltf-transform/core';
import { mat4, quat, vec3 } from 'gl-matrix';
import { fromFileUrl } from '@std/path/from-file-url';
import type { Prop } from '../../shared/Prop.ts';

interface Vector3Like {
	x: number;
	y: number;
	z: number;
}

interface MeshData {
	vertices: Float32Array;
	indices?: Uint32Array;
}

interface PropPhysicsEntry {
	prop: Prop;
	bodyHandle: RAPIER.RigidBodyHandle;
	colliderHandles: RAPIER.ColliderHandle[];
	meshKey: string;
}

const DEFAULT_GRAVITY = { x: 0, y: -9.81, z: 0 };
const FIXED_TIMESTEP = 1 / 60;

/**
 * Headless Rapier physics integration that loads static map geometry and dynamic prop meshes.
 * Converts GLB assets into collider meshes on the fly and keeps Prop instances in sync after each simulation step.
 */
export class PhysicsEngine {
	private readonly world: RAPIER.World;
	private readonly io: NodeIO;
	private readonly meshCache = new Map<string, MeshData>();
	private readonly props = new Map<number, PropPhysicsEntry>();
	private accumulator = 0;

	private constructor(world: RAPIER.World, io: NodeIO) {
		this.world = world;
		this.io = io;
	}

	static async create(mapName: string): Promise<PhysicsEngine> {
		await RAPIER.init();
		const world = new RAPIER.World(DEFAULT_GRAVITY);
		const { default: draco3d } = await import('draco3dgltf');
		const decoderModule = await draco3d.createDecoderModule();
		const io = new NodeIO()
			.registerExtensions([
				KHRTextureTransform,
				EXTTextureWebP,
				KHRMaterialsSpecular,
				KHRDracoMeshCompression,
			])
			.registerDependencies({
				'draco3d.decoder': decoderModule,
			});
		const engine = new PhysicsEngine(world, io);
		await engine.loadStaticMap(mapName);
		return engine;
	}

	async registerProp(prop: Prop): Promise<void> {
		if (!prop.doPhysics) return;

		const meshKey = this.normalizeMeshKey(prop.url);
		const meshData = await this.getMeshData(meshKey);
		const scaledVertices = this.scaleVertices(meshData.vertices, prop.scale.x, prop.scale.y, prop.scale.z);

		const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(prop.position.x, prop.position.y, prop.position.z)
			.setRotation({
				x: prop.quaternion.x,
				y: prop.quaternion.y,
				z: prop.quaternion.z,
				w: prop.quaternion.w,
			})
			.setLinvel(prop.velocity.x, prop.velocity.y, prop.velocity.z)
			.setAngvel({ x: prop.angularVelocity.x, y: prop.angularVelocity.y, z: prop.angularVelocity.z });

		const rigidBody = this.world.createRigidBody(rigidBodyDesc);

		const colliderDesc = this.buildDynamicCollider(scaledVertices);
		colliderDesc.setFriction(0.8);
		colliderDesc.setRestitution(0.1);
		const collider = this.world.createCollider(colliderDesc, rigidBody);

		this.props.set(prop.id, {
			prop,
			bodyHandle: rigidBody.handle,
			colliderHandles: [collider.handle],
			meshKey,
		});

		// Ensure the prop reflects the authoritative body state immediately.
		this.syncPropFromBody(prop, rigidBody);
	}

	applyImpulse(propId: number, impulse: Vector3Like): void {
		const entry = this.props.get(propId);
		if (!entry) return;
		const body = this.world.getRigidBody(entry.bodyHandle);
		if (!body) return;
		body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
	}

	removeProp(propId: number): void {
		const entry = this.props.get(propId);
		if (!entry) return;
		const body = this.world.getRigidBody(entry.bodyHandle);
		if (body) {
			this.world.removeRigidBody(body);
		}
		this.props.delete(propId);
	}

	step(deltaSeconds: number): void {
		if (deltaSeconds <= 0) {
			this.syncAllProps();
			return;
		}

		this.accumulator += deltaSeconds;
		while (this.accumulator >= FIXED_TIMESTEP) {
			this.world.step();
			this.accumulator -= FIXED_TIMESTEP;
		}

		this.syncAllProps();
	}

	private async loadStaticMap(mapName: string): Promise<void> {
		const meshKey = this.normalizeMeshKey(`maps/${mapName}/map.glb`);
		const meshData = await this.getMeshData(meshKey);
		const indices = meshData.indices ?? this.buildSequentialIndices(meshData.vertices.length / 3);
		const colliderDesc = RAPIER.ColliderDesc.trimesh(meshData.vertices, indices);
		colliderDesc.setFriction(0.9);
		colliderDesc.setRestitution(0.0);
		this.world.createCollider(colliderDesc); // Static collider (no rigid body handle passed)
	}

	private syncAllProps(): void {
		for (const entry of this.props.values()) {
			const body = this.world.getRigidBody(entry.bodyHandle);
			if (!body) continue;
			this.syncPropFromBody(entry.prop, body);
		}
	}

	private syncPropFromBody(prop: Prop, body: RAPIER.RigidBody): void {
		const translation = body.translation();
		prop.position.set(translation.x, translation.y, translation.z);

		const rotation = body.rotation();
		prop.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

		const linvel = body.linvel();
		prop.velocity.set(linvel.x, linvel.y, linvel.z);

		const angvel = body.angvel();
		prop.angularVelocity.set(angvel.x, angvel.y, angvel.z);
	}

	private scaleVertices(source: Float32Array, sx: number, sy: number, sz: number): Float32Array {
		const result = new Float32Array(source.length);
		for (let i = 0; i < source.length; i += 3) {
			result[i] = source[i] * sx;
			result[i + 1] = source[i + 1] * sy;
			result[i + 2] = source[i + 2] * sz;
		}
		return result;
	}

	private buildSequentialIndices(vertexCount: number): Uint32Array {
		const indices = new Uint32Array(vertexCount);
		for (let i = 0; i < vertexCount; i++) {
			indices[i] = i;
		}
		return indices;
	}

	private buildDynamicCollider(vertices: Float32Array): RAPIER.ColliderDesc {
		if (vertices.length >= 12) { // Minimum for a convex hull (4 points)
			const convex = RAPIER.ColliderDesc.convexHull(vertices);
			if (convex) return convex;
		}

		// Fallback to a spherical approximation if convex hull fails (e.g., degenerate geometry)
		let radius = 0.5;
		if (vertices.length >= 3) {
			let maxSq = 0;
			for (let i = 0; i < vertices.length; i += 3) {
				const x = vertices[i];
				const y = vertices[i + 1];
				const z = vertices[i + 2];
				const lenSq = x * x + y * y + z * z;
				if (lenSq > maxSq) maxSq = lenSq;
			}
			radius = Math.sqrt(maxSq);
		}
		return RAPIER.ColliderDesc.ball(Math.max(radius, 0.1));
	}

	private async getMeshData(meshKey: string): Promise<MeshData> {
		const cached = this.meshCache.get(meshKey);
		if (cached) return cached;

		const absolutePath = this.resolveDistPath(meshKey);
		const document = await this.io.read(absolutePath);
		const root = document.getRoot();
		const scenes = root.listScenes();

		const vertices: number[] = [];
		const indices: number[] = [];
		let hasIndices = false;

		for (const scene of scenes) {
			for (const child of scene.listChildren()) {
				this.collectMeshData(child, mat4.create(), vertices, indices, () => {
					hasIndices = true;
				});
			}
		}

		const meshData: MeshData = {
			vertices: new Float32Array(vertices),
			indices: hasIndices ? new Uint32Array(indices) : undefined,
		};
		this.meshCache.set(meshKey, meshData);
		return meshData;
	}

	private collectMeshData(
		node: Node,
		parentMatrix: mat4,
		vertexAccumulator: number[],
		indexAccumulator: number[],
		setHasIndices: () => void,
	): void {
		const worldMatrix = mat4.create();
		mat4.multiply(worldMatrix, parentMatrix, this.getNodeMatrix(node));

		const mesh = node.getMesh();
		if (mesh) {
			this.extractMeshPrimitives(mesh, worldMatrix, vertexAccumulator, indexAccumulator, setHasIndices);
		}

		for (const child of node.listChildren()) {
			this.collectMeshData(child, worldMatrix, vertexAccumulator, indexAccumulator, setHasIndices);
		}
	}

	private extractMeshPrimitives(
		mesh: Mesh,
		worldMatrix: mat4,
		vertexAccumulator: number[],
		indexAccumulator: number[],
		setHasIndices: () => void,
	): void {
		for (const primitive of mesh.listPrimitives()) {
			const positionAccessor = primitive.getAttribute('POSITION');
			if (!positionAccessor) continue;

			const positions = positionAccessor.getArray();
			if (!positions) continue;

			const transformedVertices: number[] = [];
			const temp = vec3.create();

			for (let i = 0; i < positions.length; i += 3) {
				vec3.set(temp, positions[i], positions[i + 1], positions[i + 2]);
				vec3.transformMat4(temp, temp, worldMatrix);
				transformedVertices.push(temp[0], temp[1], temp[2]);
			}

			const vertexOffset = vertexAccumulator.length / 3;
			vertexAccumulator.push(...transformedVertices);

			const indexAccessor = primitive.getIndices();
			if (indexAccessor) {
				const rawIndices = indexAccessor.getArray();
				if (!rawIndices) continue;
				setHasIndices();
				for (let i = 0; i < rawIndices.length; i++) {
					indexAccumulator.push(vertexOffset + rawIndices[i]);
				}
			} else {
				// Assume triangle lists if no indices are provided.
				const mode = primitive.getMode();
				if (mode !== null && mode !== undefined && mode !== 4) {
					continue;
				}
				for (let i = 0; i < transformedVertices.length / 3; i++) {
					indexAccumulator.push(vertexOffset + i);
				}
				setHasIndices();
			}
		}
	}

	private getNodeMatrix(node: Node): mat4 {
		const matrix = node.getMatrix();
		if (matrix) {
			const out = mat4.create();
			const values = matrix as unknown as number[];
			for (let i = 0; i < 16; i++) {
				out[i] = values[i];
			}
			return out;
		}

		const translation = node.getTranslation() ?? [0, 0, 0];
		const rotation = node.getRotation() ?? [0, 0, 0, 1];
		const scale = node.getScale() ?? [1, 1, 1];

		const out = mat4.create();
		return mat4.fromRotationTranslationScale(out, rotation as quat, translation as vec3, scale as vec3);
	}

	private resolveDistPath(relative: string): string {
		const normalized = relative.replace(/^\/+/, '');
		const baseUrl = new URL('../../../dist/', import.meta.url);
		const fileUrl = new URL(normalized, baseUrl);
		return fromFileUrl(fileUrl);
	}

	private normalizeMeshKey(url: string): string {
		return url.replace(/^\/+/, '');
	}
}
