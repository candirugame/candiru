import * as THREE from 'three';
import { InputHandler } from '../input/InputHandler.ts';
import { Player } from '../../shared/Player.ts';
import { Renderer } from './Renderer.ts';
import { MapLoader } from './MapLoader.ts';

interface MappingProp {
	sourceNodeName: string;
	url: string;
	name: string;
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	scale: THREE.Vector3;
	velocity: THREE.Vector3;
	angularVelocity: THREE.Vector3;
	doPhysics: boolean;
	playersCollide: boolean;
	health?: number;
}

interface MappingFormValues {
	url: string;
	name: string;
	scale: THREE.Vector3;
	velocity: THREE.Vector3;
	angularVelocity: THREE.Vector3;
	doPhysics: boolean;
	playersCollide: boolean;
	health?: number;
}

const PROP_MODELS = [
	{ label: 'Banana', url: '/models/simplified_banana_1.glb' },
	{ label: 'Bottle', url: '/models/simplified_bottle.glb' },
	{ label: 'Fish', url: '/models/simplified_fish.glb' },
	{ label: 'Pizza', url: '/models/simplified_pizza.glb' },
	{ label: 'Pipe', url: '/models/simplified_rusty_pipe.glb' },
	{ label: 'Possum', url: '/models/simplified_possum.glb' },
	{ label: 'Flamingo', url: '/models/simplified_flamingo.glb' },
	{ label: 'Hexagon', url: '/models/hexagon.glb' },
];

export class MappingMode {
	private readonly raycaster = new THREE.Raycaster();
	private readonly replacements = new Map<string, MappingProp>();
	private readonly originallyExcluded = new Set<string>();
	private readonly overlay: HTMLDivElement;
	private readonly statusEl: HTMLDivElement;
	private readonly selectedEl: HTMLDivElement;
	private readonly countEl: HTMLDivElement;
	private readonly exportEl: HTMLTextAreaElement;
	private readonly modelSelect: HTMLSelectElement;
	private readonly nameInput: HTMLInputElement;
	private readonly scaleInputs: HTMLInputElement[];
	private readonly velocityInputs: HTMLInputElement[];
	private readonly angularVelocityInputs: HTMLInputElement[];
	private readonly physicsCheckbox: HTMLInputElement;
	private readonly collideCheckbox: HTMLInputElement;
	private readonly healthInput: HTMLInputElement;
	private readonly noclipCheckbox: HTMLInputElement;
	private selectedObject: THREE.Object3D | null = null;
	private selectionHelper: THREE.BoxHelper | null = null;
	private active = false;
	private lastExport = '';

	constructor(
		private readonly renderer: Renderer,
		private readonly inputHandler: InputHandler,
		private readonly localPlayer: Player,
		private readonly mapLoader: MapLoader,
	) {
		this.overlay = document.createElement('div');
		this.overlay.className = 'mapping-mode-panel';
		this.overlay.innerHTML = `
			<div class="mapping-mode-title">Mapper Mode</div>
			<div class="mapping-mode-row">
				<label><input data-role="noclip" type="checkbox" checked> no-clip</label>
				<span data-role="count">0 props</span>
			</div>
			<div data-role="status" class="mapping-mode-status">Click a map object to select it.</div>
			<div data-role="selected" class="mapping-mode-selected">No object selected</div>
			<label>prop model
				<select data-role="model"></select>
			</label>
			<label>prop name
				<input data-role="name" type="text" maxlength="42">
			</label>
			<div class="mapping-mode-grid">
				<label>scale x<input data-role="scale" data-axis="x" type="number" step="0.05"></label>
				<label>scale y<input data-role="scale" data-axis="y" type="number" step="0.05"></label>
				<label>scale z<input data-role="scale" data-axis="z" type="number" step="0.05"></label>
				<label>vel x<input data-role="velocity" data-axis="x" type="number" step="0.1"></label>
				<label>vel y<input data-role="velocity" data-axis="y" type="number" step="0.1"></label>
				<label>vel z<input data-role="velocity" data-axis="z" type="number" step="0.1"></label>
				<label>ang x<input data-role="angularVelocity" data-axis="x" type="number" step="0.1"></label>
				<label>ang y<input data-role="angularVelocity" data-axis="y" type="number" step="0.1"></label>
				<label>ang z<input data-role="angularVelocity" data-axis="z" type="number" step="0.1"></label>
			</div>
			<div class="mapping-mode-row">
				<label><input data-role="physics" type="checkbox" checked> physics</label>
				<label><input data-role="collide" type="checkbox" checked> player collision</label>
				<label>health <input data-role="health" type="number" step="1" min="0" placeholder="none"></label>
			</div>
			<div class="mapping-mode-actions">
				<button data-action="add" type="button">Add / update</button>
				<button data-action="remove" type="button">Remove</button>
				<button data-action="export" type="button">Export JSON</button>
				<button data-action="copy" type="button">Copy</button>
				<button data-action="download" type="button">Download</button>
			</div>
			<textarea data-role="export" spellcheck="false"></textarea>
		`;

		this.installStyles();

		this.statusEl = this.overlay.querySelector('[data-role="status"]')!;
		this.selectedEl = this.overlay.querySelector('[data-role="selected"]')!;
		this.countEl = this.overlay.querySelector('[data-role="count"]')!;
		this.exportEl = this.overlay.querySelector('[data-role="export"]')!;
		this.modelSelect = this.overlay.querySelector('[data-role="model"]')!;
		this.nameInput = this.overlay.querySelector('[data-role="name"]')!;
		this.scaleInputs = Array.from(this.overlay.querySelectorAll('[data-role="scale"]'));
		this.velocityInputs = Array.from(this.overlay.querySelectorAll('[data-role="velocity"]'));
		this.angularVelocityInputs = Array.from(this.overlay.querySelectorAll('[data-role="angularVelocity"]'));
		this.physicsCheckbox = this.overlay.querySelector('[data-role="physics"]')!;
		this.collideCheckbox = this.overlay.querySelector('[data-role="collide"]')!;
		this.healthInput = this.overlay.querySelector('[data-role="health"]')!;
		this.noclipCheckbox = this.overlay.querySelector('[data-role="noclip"]')!;

		for (const model of PROP_MODELS) {
			const option = document.createElement('option');
			option.value = model.url;
			option.textContent = model.label;
			this.modelSelect.appendChild(option);
		}

		this.overlay.addEventListener('mousedown', (event) => event.stopPropagation());
		this.overlay.addEventListener('click', (event) => event.stopPropagation());
		this.overlay.addEventListener('wheel', (event) => event.stopPropagation());
		this.overlay.addEventListener('keydown', (event) => event.stopPropagation());

		this.overlay.querySelector('[data-action="add"]')?.addEventListener('click', () => this.addOrUpdateSelection());
		this.overlay.querySelector('[data-action="remove"]')?.addEventListener('click', () => this.removeSelection());
		this.overlay.querySelector('[data-action="export"]')?.addEventListener('click', () => this.exportMapJson());
		this.overlay.querySelector('[data-action="copy"]')?.addEventListener('click', () => this.copyExport());
		this.overlay.querySelector('[data-action="download"]')?.addEventListener('click', () => this.downloadExport());

		document.addEventListener('mousedown', this.onDocumentMouseDown, true);
		document.addEventListener('keydown', this.onDocumentKeyDown, true);
		this.setVectorInputs(this.scaleInputs, new THREE.Vector3(1, 1, 1));
		this.setVectorInputs(this.velocityInputs, new THREE.Vector3(0, 0, 0));
		this.setVectorInputs(this.angularVelocityInputs, new THREE.Vector3(0, 0, 0));
	}

	public initFromLocation(): void {
		const params = new URLSearchParams(globalThis.location.search);
		const enabled = params.get('mode') === 'mapping' || params.get('mapping') === '1' ||
			globalThis.location.hash === '#mapping';
		this.setActive(enabled);
	}

	public destroy(): void {
		this.setActive(false);
		document.removeEventListener('mousedown', this.onDocumentMouseDown, true);
		document.removeEventListener('keydown', this.onDocumentKeyDown, true);
		this.overlay.remove();
		this.clearSelectionHelper();
	}

	public isActive(): boolean {
		return this.active;
	}

	public isNoClipEnabled(): boolean {
		return this.active && this.noclipCheckbox.checked;
	}

	public onFrame(deltaTime: number): void {
		if (!this.active) return;
		this.trackInitialExclusions();
		if (this.selectionHelper && this.selectedObject) this.selectionHelper.update();
		if (this.isNoClipEnabled()) this.freeFly(deltaTime);
	}

	private setActive(active: boolean): void {
		if (this.active === active) return;
		this.active = active;
		this.inputHandler.setMappingModeEnabled(active);
		if (active) {
			document.body.appendChild(this.overlay);
			this.statusEl.textContent = 'Mapper active. Click the game view to select map nodes.';
		} else {
			this.overlay.remove();
			this.localPlayer.doPhysics = true;
			this.clearSelectionHelper();
		}
	}

	private freeFly(deltaTime: number): void {
		this.localPlayer.doPhysics = false;
		this.localPlayer.gravity = 0;
		this.localPlayer.inputVelocity.set(0, 0, 0);
		this.localPlayer.velocity.set(0, 0, 0);

		const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.localPlayer.lookQuaternion).normalize();
		const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.localPlayer.lookQuaternion).normalize();
		const up = new THREE.Vector3(0, 1, 0);
		const move = new THREE.Vector3();

		if (this.inputHandler.getKey('w')) move.add(forward);
		if (this.inputHandler.getKey('s')) move.sub(forward);
		if (this.inputHandler.getKey('d')) move.add(right);
		if (this.inputHandler.getKey('a')) move.sub(right);
		if (this.inputHandler.getKey(' ')) move.add(up);
		if (this.inputHandler.getKey('control')) move.sub(up);

		if (move.lengthSq() === 0) return;
		const speed = this.inputHandler.getKey('shift') ? 18 : 7;
		this.localPlayer.position.add(move.normalize().multiplyScalar(speed * deltaTime));
	}

	private onDocumentKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'F7') {
			event.preventDefault();
			this.setActive(!this.active);
		}
	};

	private onDocumentMouseDown = (event: MouseEvent): void => {
		if (!this.active || event.button !== 0) return;
		if (this.overlay.contains(event.target as Node)) return;
		this.selectFromCrosshair();
		event.preventDefault();
		event.stopPropagation();
	};

	private selectFromCrosshair(): void {
		const mapObject = this.mapLoader.getMapObject();
		if (!mapObject) {
			this.statusEl.textContent = 'Map is not loaded yet.';
			return;
		}

		this.raycaster.set(this.renderer.getMuzzlePosition(), this.renderer.getMuzzleDirection().normalize());
		this.raycaster.far = 500;
		const hits = this.raycaster.intersectObject(mapObject, true).filter((hit) => hit.object.visible);
		const hit = hits[0];
		if (!hit) {
			this.statusEl.textContent = 'No map object under crosshair.';
			return;
		}

		const selectable = this.getSelectableObject(hit.object, mapObject);
		this.setSelectedObject(selectable);
	}

	private getSelectableObject(object: THREE.Object3D, mapObject: THREE.Group): THREE.Object3D {
		let current: THREE.Object3D | null = object;
		while (current && current !== mapObject) {
			if (current.name) return current;
			current = current.parent;
		}
		return object;
	}

	private setSelectedObject(object: THREE.Object3D): void {
		this.selectedObject = object;
		this.clearSelectionHelper();
		this.selectionHelper = new THREE.BoxHelper(object, 0xffe45c);
		this.renderer.getScene().add(this.selectionHelper);

		const existing = object.name ? this.replacements.get(object.name) : undefined;
		if (existing) {
			this.applyFormValues(existing);
			this.statusEl.textContent = 'Selected mapped physics prop.';
		} else {
			this.populateFormFromObject(object);
			this.statusEl.textContent = object.name ? 'Selected static map node.' : 'Selected node has no exportable name.';
		}
		this.selectedEl.textContent = object.name || '(unnamed node)';
	}

	private populateFormFromObject(object: THREE.Object3D): void {
		const position = new THREE.Vector3();
		const quaternion = new THREE.Quaternion();
		const scale = new THREE.Vector3();
		object.updateWorldMatrix(true, false);
		object.matrixWorld.decompose(position, quaternion, scale);

		this.modelSelect.value = PROP_MODELS[0].url;
		this.nameInput.value = `mapped:${object.name || 'unnamed'}`;
		this.setVectorInputs(this.scaleInputs, scale);
		this.setVectorInputs(this.velocityInputs, new THREE.Vector3(0, 0, 0));
		this.setVectorInputs(this.angularVelocityInputs, new THREE.Vector3(0, 0, 0));
		this.physicsCheckbox.checked = true;
		this.collideCheckbox.checked = true;
		this.healthInput.value = '100';
	}

	private addOrUpdateSelection(): void {
		if (!this.selectedObject?.name) {
			this.statusEl.textContent = 'Select a named map node before adding a prop.';
			return;
		}

		const position = new THREE.Vector3();
		const quaternion = new THREE.Quaternion();
		const objectScale = new THREE.Vector3();
		this.selectedObject.updateWorldMatrix(true, false);
		this.selectedObject.matrixWorld.decompose(position, quaternion, objectScale);

		const form = this.readFormValues();
		const prop: MappingProp = {
			sourceNodeName: this.selectedObject.name,
			url: form.url,
			name: form.name,
			position,
			quaternion,
			scale: form.scale,
			velocity: form.velocity,
			angularVelocity: form.angularVelocity,
			doPhysics: form.doPhysics,
			playersCollide: form.playersCollide,
			health: form.health,
		};

		this.replacements.set(prop.sourceNodeName, prop);
		this.hideNode(prop.sourceNodeName);
		this.updateCount();
		this.exportMapJson();
		this.statusEl.textContent = `Mapped ${prop.sourceNodeName} as ${this.modelLabel(prop.url)}.`;
	}

	private removeSelection(): void {
		if (!this.selectedObject?.name) return;
		const sourceName = this.selectedObject.name;
		if (this.replacements.delete(sourceName)) {
			this.unhideNode(sourceName);
			this.updateCount();
			this.exportMapJson();
			this.statusEl.textContent = `Removed mapping for ${sourceName}.`;
		}
	}

	private readFormValues(): MappingFormValues {
		const health = Number.parseFloat(this.healthInput.value);
		return {
			url: this.modelSelect.value,
			name: this.nameInput.value.trim().slice(0, 42),
			scale: this.readVectorInputs(this.scaleInputs, new THREE.Vector3(1, 1, 1)),
			velocity: this.readVectorInputs(this.velocityInputs, new THREE.Vector3(0, 0, 0)),
			angularVelocity: this.readVectorInputs(this.angularVelocityInputs, new THREE.Vector3(0, 0, 0)),
			doPhysics: this.physicsCheckbox.checked,
			playersCollide: this.collideCheckbox.checked,
			health: Number.isFinite(health) ? health : undefined,
		};
	}

	private applyFormValues(prop: MappingProp): void {
		this.modelSelect.value = prop.url;
		this.nameInput.value = prop.name;
		this.setVectorInputs(this.scaleInputs, prop.scale);
		this.setVectorInputs(this.velocityInputs, prop.velocity);
		this.setVectorInputs(this.angularVelocityInputs, prop.angularVelocity);
		this.physicsCheckbox.checked = prop.doPhysics;
		this.collideCheckbox.checked = prop.playersCollide;
		this.healthInput.value = prop.health === undefined ? '' : String(prop.health);
	}

	private exportMapJson(): string {
		const base = this.mapLoader.getMapJson() ?? {
			name: this.fallbackMapName(),
		};
		const existingExclusions = new Set(base.staticPropExclusions ?? []);
		for (const sourceName of this.replacements.keys()) existingExclusions.add(sourceName);

		const mappedProps = Array.from(this.replacements.values()).map((prop) => ({
			url: prop.url,
			name: prop.name,
			position: this.vectorToJson(prop.position),
			quaternion: this.quaternionToJson(prop.quaternion),
			scale: this.vectorToJson(prop.scale),
			doPhysics: prop.doPhysics,
			playersCollide: prop.playersCollide,
			health: prop.health,
			velocity: this.vectorToJson(prop.velocity),
			angularVelocity: this.vectorToJson(prop.angularVelocity),
		}));

		const nextJson = {
			...base,
			staticPropExclusions: Array.from(existingExclusions),
			props: [...(base.props ?? []), ...mappedProps],
		};
		this.lastExport = JSON.stringify(nextJson, null, '\t');
		this.exportEl.value = this.lastExport;
		return this.lastExport;
	}

	private async copyExport(): Promise<void> {
		const payload = this.lastExport || this.exportMapJson();
		try {
			await navigator.clipboard.writeText(payload);
			this.statusEl.textContent = 'Export copied to clipboard.';
		} catch {
			this.exportEl.focus();
			this.exportEl.select();
			this.statusEl.textContent = 'Clipboard unavailable; export text selected.';
		}
	}

	private downloadExport(): void {
		const payload = this.lastExport || this.exportMapJson();
		const blob = new Blob([payload], { type: 'application/json' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = 'map.json';
		link.click();
		URL.revokeObjectURL(link.href);
	}

	private hideNode(name: string): void {
		const node = this.mapLoader.findStaticNodeByName(name);
		if (!node) return;
		node.visible = false;
	}

	private unhideNode(name: string): void {
		if (this.originallyExcluded.has(name)) return;
		const node = this.mapLoader.findStaticNodeByName(name);
		if (!node) return;
		node.visible = true;
	}

	private trackInitialExclusions(): void {
		const exclusions = this.mapLoader.getMapJson()?.staticPropExclusions ?? [];
		for (const name of exclusions) this.originallyExcluded.add(name);
	}

	private updateCount(): void {
		const count = this.replacements.size;
		this.countEl.textContent = `${count} prop${count === 1 ? '' : 's'}`;
	}

	private clearSelectionHelper(): void {
		if (!this.selectionHelper) return;
		this.renderer.getScene().remove(this.selectionHelper);
		this.selectionHelper.dispose();
		this.selectionHelper = null;
	}

	private readVectorInputs(inputs: HTMLInputElement[], fallback: THREE.Vector3): THREE.Vector3 {
		const values = inputs.map((input, index) => {
			const parsed = Number.parseFloat(input.value);
			return Number.isFinite(parsed) ? parsed : fallback.getComponent(index);
		});
		return new THREE.Vector3(values[0], values[1], values[2]);
	}

	private setVectorInputs(inputs: HTMLInputElement[], vector: THREE.Vector3): void {
		inputs[0].value = this.formatNumber(vector.x);
		inputs[1].value = this.formatNumber(vector.y);
		inputs[2].value = this.formatNumber(vector.z);
	}

	private vectorToJson(vector: THREE.Vector3): { x: number; y: number; z: number } {
		return {
			x: this.round(vector.x),
			y: this.round(vector.y),
			z: this.round(vector.z),
		};
	}

	private quaternionToJson(quaternion: THREE.Quaternion): { x: number; y: number; z: number; w: number } {
		return {
			x: this.round(quaternion.x),
			y: this.round(quaternion.y),
			z: this.round(quaternion.z),
			w: this.round(quaternion.w),
		};
	}

	private formatNumber(value: number): string {
		return String(this.round(value));
	}

	private round(value: number): number {
		return Math.round(value * 10000) / 10000;
	}

	private modelLabel(url: string): string {
		return PROP_MODELS.find((model) => model.url === url)?.label ?? url;
	}

	private fallbackMapName(): string {
		const parts = this.mapLoader.getMapJsonUrl().split('/').filter((part) => part.length > 0);
		return parts.length >= 2 ? parts[parts.length - 2] : 'mapped_map';
	}

	private installStyles(): void {
		if (document.getElementById('mapping-mode-styles')) return;
		const style = document.createElement('style');
		style.id = 'mapping-mode-styles';
		style.textContent = `
			.mapping-mode-panel {
				position: fixed;
				top: 12px;
				right: 12px;
				z-index: 50;
				width: min(380px, calc(100vw - 24px));
				max-height: calc(100vh - 24px);
				overflow: auto;
				box-sizing: border-box;
				padding: 12px;
				border: 1px solid rgba(255, 255, 255, 0.28);
				border-radius: 6px;
				background: rgba(12, 14, 16, 0.92);
				color: #f5f1df;
				font: 13px/1.35 system-ui, sans-serif;
				pointer-events: auto;
			}
			.mapping-mode-title {
				font-weight: 700;
				font-size: 16px;
				margin-bottom: 8px;
			}
			.mapping-mode-row,
			.mapping-mode-actions {
				display: flex;
				align-items: center;
				gap: 8px;
				flex-wrap: wrap;
				margin: 8px 0;
			}
			.mapping-mode-status,
			.mapping-mode-selected {
				margin: 8px 0;
				color: #d4cfb5;
				overflow-wrap: anywhere;
			}
			.mapping-mode-panel label {
				display: block;
				margin: 6px 0;
			}
			.mapping-mode-grid {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 6px;
			}
			.mapping-mode-panel input,
			.mapping-mode-panel select,
			.mapping-mode-panel textarea,
			.mapping-mode-panel button {
				box-sizing: border-box;
				width: 100%;
				border: 1px solid rgba(255, 255, 255, 0.22);
				border-radius: 4px;
				background: #1b1f23;
				color: #f5f1df;
				font: inherit;
			}
			.mapping-mode-panel input[type="checkbox"] {
				width: auto;
			}
			.mapping-mode-panel button {
				width: auto;
				padding: 5px 8px;
				cursor: pointer;
				background: #2c3438;
			}
			.mapping-mode-panel textarea {
				min-height: 170px;
				resize: vertical;
				font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
			}
		`;
		document.head.appendChild(style);
	}
}
