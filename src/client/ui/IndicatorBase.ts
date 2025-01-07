import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Player } from '../../shared/Player.ts';
import { Networking } from '../core/Networking.ts';
import { Renderer } from '../core/Renderer.ts';

export abstract class IndicatorBase {
	protected scene: THREE.Scene;
	protected camera: THREE.Camera;
	protected model!: THREE.Object3D;
	protected ambientLight: THREE.AmbientLight;

	// Scissor and viewport dimensions
	protected scissor = new THREE.Vector4();
	protected viewport = new THREE.Vector4();

	constructor(
		protected parentRenderer: Renderer,
		protected localPlayer: Player,
		protected networking: Networking,
	) {
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 1000);
		this.camera.position.set(0, 0, 0);
		this.camera.lookAt(0, 0, 1);

		// Add ambient light to the scene
		this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		this.scene.add(this.ambientLight);
	}

	/**
	 * Initialize the indicator (e.g., load models).
	 */
	abstract init(): void;

	/**
	 * Update the indicator each frame.
	 * @param deltaTime Time elapsed since the last frame.
	 */
	abstract onFrame(deltaTime: number): void;

	/**
	 * Render the indicator by setting up scissor test and viewport.
	 */
	public render(): void {
		this.setupScissorAndViewport();

		const renderer = this.parentRenderer.getWebGLRenderer();

		renderer.setScissorTest(true);
		renderer.setScissor(
			this.scissor.x,
			this.scissor.y,
			this.scissor.z,
			this.scissor.w,
		);
		renderer.setViewport(
			this.viewport.x,
			this.viewport.y,
			this.viewport.z,
			this.viewport.w,
		);

		renderer.render(this.scene, this.camera);

		renderer.setScissorTest(false);
	}

	/**
	 * Define scissor and viewport settings.
	 * Must be implemented by subclasses.
	 */
	protected abstract setupScissorAndViewport(): void;

	/**
	 * Utility method to load a GLTF model with Draco compression.
	 * @param modelPath Path to the GLTF model.
	 * @returns A promise that resolves to the loaded Object3D.
	 */
	protected loadModel(modelPath: string): Promise<THREE.Object3D> {
		const loader = new GLTFLoader();
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath('/draco/');
		loader.setDRACOLoader(dracoLoader);
		return new Promise((resolve, reject) => {
			loader.load(
				modelPath,
				(gltf) => {
					const object = gltf.scene;
					object.traverse((child) => {
						if ((child as THREE.Mesh).isMesh) {
							(child as THREE.Mesh).renderOrder = 999;
							this.applyDepthTest(child as THREE.Mesh);
						}
					});
					resolve(object);
				},
				undefined,
				() => {
					reject(new Error(`Failed to load model: ${modelPath}`));
				},
			);
		});
	}

	/**
	 * Recursively disable depth testing on materials.
	 * @param mesh The mesh whose materials will have depth testing disabled.
	 */
	protected applyDepthTest(mesh: THREE.Mesh) {
		if ((mesh as THREE.Mesh).isMesh) {
			const meshInstance = mesh as THREE.Mesh;
			const apply = (material: THREE.Material | THREE.Material[]) => {
				if (Array.isArray(material)) {
					material.forEach((mat) => this.applyDepthTestOnMaterial(mat));
				} else {
					this.applyDepthTestOnMaterial(material);
				}
			};
			apply(meshInstance.material);
		}
	}

	/**
	 * Disable depth testing on a single material.
	 * @param material The material to modify.
	 */
	private applyDepthTestOnMaterial(material: THREE.Material) {
		material.depthTest = false;
	}

	// Utility functions
	public rotateAroundWorldAxis(source: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
		const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
		source.multiplyQuaternions(rotationQuat, source);
	}

	public moveTowardsPos(source: THREE.Vector3, target: THREE.Vector3, frac: number) {
		source.lerp(target, frac);
	}

	public moveTowardsRot(source: THREE.Quaternion, target: THREE.Quaternion, frac: number) {
		source.slerp(target, frac);
	}

	public rgbToHex(r: number, g: number, b: number): number {
		return (r << 16) + (g << 8) + b;
	}
}
