import * as RENDERER from './ren.module.js';
import * as THREE from 'three';

const scene = RENDERER.getScene();
const camera = RENDERER.getCamera();

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

canvas.width = 512;
canvas.height = 512;

// Ensure the canvas background is transparent by not filling it with any color
context.font = '48px Arial';
context.fillStyle = 'white'; // Set the text color to black
context.fillText('test', 256, 256);

// Create a texture from the canvas
const texture = new THREE.CanvasTexture(canvas);

// Create a plane geometry and apply the texture
const geometry = new THREE.PlaneGeometry(canvas.width, canvas.height);
const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true // Enable transparency
});

const plane = new THREE.Mesh(geometry, material);

// Scale down the plane to make it visible
const scaleFactor = 0.001; // Adjust this value as needed
plane.scale.set(scaleFactor, scaleFactor, scaleFactor);

// Add the plane to the scene
scene.add(plane);

// Set the plane's position right in front of the camera
const distanceFromCamera = 0.1; // Closest depth (near plane)


// Calculate the new position in front of the camera

export function onFrame() {
    const vector = new THREE.Vector3(0, 0, -distanceFromCamera);
    vector.applyMatrix4(camera.matrixWorld);
    plane.position.set(vector.x, vector.y, vector.z);

// Align the plane to face the camera
    plane.quaternion.copy(camera.quaternion);
}
