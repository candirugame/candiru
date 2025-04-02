import * as THREE from 'three';

interface Particle {
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	lifetime: number;
	maxLifetime: number;
	size: number;
	color: THREE.Color;
}

export class ParticleSystem {
	private particles: Particle[] = [];
	private geometry: THREE.BufferGeometry;
	private material: THREE.ShaderMaterial;
	private mesh: THREE.Points;

	constructor(private scene: THREE.Scene) {
		// Shader material setup for size attenuation
		this.material = new THREE.ShaderMaterial({
			uniforms: {
				size: { value: 1.0 },
			},
			vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z) * size;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
			fragmentShader: `
                varying vec3 vColor;
                void main() {
                    gl_FragColor = vec4(vColor, 1.0);
                }
            `,
			transparent: false,
			depthWrite: true,
			blending: THREE.AdditiveBlending,
		});

		// Geometry setup
		this.geometry = new THREE.BufferGeometry();
		this.mesh = new THREE.Points(this.geometry, this.material);
		this.scene.add(this.mesh);
	}

	emit(options: {
		position: THREE.Vector3;
		count: number;
		velocity: THREE.Vector3;
		spread: number;
		lifetime: number;
		size: number;
		color: THREE.Color;
	}) {
		for (let i = 0; i < options.count; i++) {
			this.particles.push({
				position: options.position.clone(),
				velocity: options.velocity.clone()
					.add(
						new THREE.Vector3(
							(Math.random() - 0.5) * options.spread,
							(Math.random() - 0.5) * options.spread,
							(Math.random() - 0.5) * options.spread,
						),
					),
				lifetime: options.lifetime,
				maxLifetime: options.lifetime,
				size: options.size,
				color: options.color.clone(),
			});
		}
	}

	update(deltaTime: number, cameraPosition: THREE.Vector3) {
		// Update particle logic and filter out expired particles
		this.particles = this.particles.filter((p) => {
			p.lifetime -= deltaTime;
			p.position.add(p.velocity.clone().multiplyScalar(deltaTime));
			return p.lifetime > 0;
		});

		// Update GPU buffers
		const positions = new Float32Array(this.particles.length * 3);
		const colors = new Float32Array(this.particles.length * 3);
		const sizes = new Float32Array(this.particles.length);

		this.particles.forEach((p, i) => {
			positions[i * 3] = p.position.x;
			positions[i * 3 + 1] = p.position.y;
			positions[i * 3 + 2] = p.position.z;

			colors[i * 3] = p.color.r;
			colors[i * 3 + 1] = p.color.g;
			colors[i * 3 + 2] = p.color.b;

			//sizes[i] = p.size * (p.lifetime / p.maxLifetime);
			sizes[i] = p.size;
			if (p.position.distanceTo(cameraPosition) > 30) {
				p.lifetime = 0;
			}
		});

		// Set attributes and flag for update
		this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

		this.geometry.attributes.position.needsUpdate = true;
		this.geometry.attributes.color.needsUpdate = true;
		this.geometry.attributes.size.needsUpdate = true;

		// Update the draw range to match the number of particles
		this.geometry.setDrawRange(0, this.particles.length);

		// Recompute the bounding sphere so that frustum culling works correctly
		this.geometry.computeBoundingSphere();
	}

	dispose() {
		this.scene.remove(this.mesh);
		this.geometry.dispose();
		this.material.dispose();
	}
}
