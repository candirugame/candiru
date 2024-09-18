import * as RENDERER from './ren.module.js';
import * as THREE from 'three';
if (import.meta.hot) {import.meta.hot.accept(() => {});}


let scene = new THREE.Scene();

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

canvas.width = 512;
canvas.height = 200; // Update canvas height to 200px

// Ensure the canvas background is transparent by not filling it with any color
context.font = '8px Comic Sans MS';
context.fillStyle = 'white'; // Set the text color to white
context.fillText(' test7', 256, 100); // Adjust text position for new canvas height



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

let addedToScene = false;

export function onFrame() {
    if (!addedToScene) {
        scene.add(plane);
        addedToScene = true;
    }

    const camera = RENDERER.getCamera();
    const distanceFromCamera = 0.1; // Distance in front of the camera

    // Calculate the position of the left edge of the camera's view frustum at the given distance
    const frustumHeight = 2 * distanceFromCamera * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const frustumWidth = frustumHeight * camera.aspect;
    const leftEdgeX = -frustumWidth / 2;

    // Calculate the new position in front of the camera
    const vector = new THREE.Vector3(leftEdgeX, 0, -distanceFromCamera);
    vector.applyMatrix4(camera.matrixWorld);
    plane.position.set(vector.x, vector.y, vector.z);

    // Align the plane to face the camera
    plane.quaternion.copy(camera.quaternion);
}

export function getScene() {
    return scene;
}
