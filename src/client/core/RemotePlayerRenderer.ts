import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Player } from './Player.ts';
import {acceleratedRaycast, computeBoundsTree} from "three-mesh-bvh";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

interface RemotePlayerData {
    health: number;
    id: number;
    velocity: { x: number; y: number; z: number };
    position: { x: number; y: number; z: number };
    quaternion: [number, number, number, number]; // Add quaternion as required
    forced: boolean;
    name: string;
    playerSpectating: number;
}

interface RemotePlayer extends Omit<RemotePlayerData, 'quaternion'> {
    quaternion?: [number, number, number, number]; // Optional in case it's missing
}

interface PlayerToRender {
    id: number;
    object: THREE.Object3D;
    objectUUID: string;
    sphere: THREE.Object3D;
    nameLabel: THREE.Sprite;
    name: string;
}

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
    private scene: THREE.Scene

    private isAnimating: { [id: number]: boolean };
    private animationPhase: { [id: number]: number };
    private previousVelocity: { [id: number]: number };
    private lastRunningYOffset: { [id: number]: number };

    private groundTruthPositions: { [id: number]: THREE.Vector3 };

    private networking: Networking;
    private localPlayer: Player;
    private deltaTime: number = 0; // Initialize deltaTime to avoid Deno error
    private static minVelocityToAnimate = 0.1;
    private static map: THREE.Mesh = new THREE.Mesh();

    private crosshairVec = new THREE.Vector2();

    constructor(
        networking: Networking,
        localPlayer: Player,
        raycaster: THREE.Raycaster,
        camera: THREE.Camera,
        scene: THREE.Scene
    ) {
        this.networking = networking;
        this.localPlayer = localPlayer;
        this.raycaster = raycaster;
        this.camera = camera;
        this.scene = scene;

        this.entityScene = new THREE.Scene();

        this.sphere = new THREE.Mesh(new THREE.SphereGeometry(.6), new THREE.MeshBasicMaterial({color: 0xffffff}));
        this.sphere.geometry.computeBoundsTree();
        this.sphereScene = new THREE.Scene();

        this.loader = new GLTFLoader();
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('/draco/');
        this.loader.setDRACOLoader(this.dracoLoader);

        this.possumMesh = undefined;
        this.loader.load(
            'models/simplified_possum.glb',
            (gltf) => {
                console.time("Computing possum BVH");
                (<THREE.Mesh>gltf.scene.children[0]).geometry.computeBoundsTree();
                console.timeEnd("Computing possum BVH");
                this.possumMesh = (<THREE.Mesh>gltf.scene.children[0]);
            },
            undefined,
            () => {
                console.log('possum loading error');
            }
        );

        this.playersToRender = [];

        this.isAnimating = {};
        this.animationPhase = {};
        this.previousVelocity = {};
        this.lastRunningYOffset = {};

        this.groundTruthPositions = {};
    }

    public getEntityScene(): THREE.Scene {
        return this.entityScene;
    }

    public update(deltaTime: number): void {
        this.deltaTime = deltaTime;
        this.updateRemotePlayers();
    }

    private updateRemotePlayers(): void {
        if (!this.possumMesh) return;

        const remotePlayerData: RemotePlayer[] = this.networking.getRemotePlayerData();
        const localPlayerId = this.localPlayer.id;

        remotePlayerData.forEach((remotePlayer) => {
            if (remotePlayer.id === localPlayerId) return;
            if(remotePlayer.id === this.localPlayer.playerSpectating) return;
            if(remotePlayer.playerSpectating !== -1) return;

            const playerDataWithQuaternion: RemotePlayerData = {
                ...remotePlayer,
                quaternion: remotePlayer.quaternion || [0, 0, 0, 1], // Provide default quaternion if missing
            };

            const existingPlayer = this.playersToRender.find((player) => player.id === remotePlayer.id);
            if (existingPlayer) {
                this.updatePlayerPosition(existingPlayer.object, existingPlayer.sphere, playerDataWithQuaternion);
            } else {
                this.addNewPlayer(playerDataWithQuaternion);
            }
        });

        this.removeInactivePlayers(remotePlayerData);
    }

    private updatePlayerPosition(playerObject: THREE.Object3D, playerSphere: THREE.Object3D, remotePlayerData: RemotePlayerData): void {
        const velocity = Math.sqrt(
            Math.pow(remotePlayerData.velocity.x, 2) +
            Math.pow(remotePlayerData.velocity.y, 2) +
            Math.pow(remotePlayerData.velocity.z, 2)
        );

        const playerId = remotePlayerData.id;
        const prevVelocity = this.previousVelocity[playerId] || 0;

        if (prevVelocity <= RemotePlayerRenderer.minVelocityToAnimate && velocity > RemotePlayerRenderer.minVelocityToAnimate) {
            this.isAnimating[playerId] = true;
            this.animationPhase[playerId] = 0;
        }

        this.previousVelocity[playerId] = velocity;

        // Get or initialize groundTruthPosition
        if (!this.groundTruthPositions[playerId]) {
            this.groundTruthPositions[playerId] = new THREE.Vector3(
                remotePlayerData.position.x,
                remotePlayerData.position.y,
                remotePlayerData.position.z
            );
        }

        const groundTruthPosition = this.groundTruthPositions[playerId];

        // Apply velocity to groundTruthPosition
        groundTruthPosition.x += remotePlayerData.velocity.x * this.deltaTime;
        groundTruthPosition.y += remotePlayerData.velocity.y * this.deltaTime;
        groundTruthPosition.z += remotePlayerData.velocity.z * this.deltaTime;

        // If forced, set groundTruthPosition to remotePlayerData.position
        if (remotePlayerData.forced) {
            groundTruthPosition.set(
                remotePlayerData.position.x,
                remotePlayerData.position.y,
                remotePlayerData.position.z
            );
        }

        // Lerp groundTruthPosition towards remotePlayerData.position
        groundTruthPosition.lerp(
            new THREE.Vector3(
                remotePlayerData.position.x,
                remotePlayerData.position.y,
                remotePlayerData.position.z
            ),
            0.1 * this.deltaTime * 60
        );

        // Set playerObject.position to groundTruthPosition.clone()
        playerObject.position.copy(groundTruthPosition);
        playerSphere.position.copy(groundTruthPosition.clone());

        // Apply animation offsets (e.g., yOffset)
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

        // Apply scared effect
        const scaredLevel = 1 - Math.pow(remotePlayerData.health / this.networking.getServerInfo().playerMaxHealth, 2); // 0-1
        playerObject.position.x += (Math.random() - 0.5) * 0.05 * scaredLevel;
        playerObject.position.y += (Math.random() - 0.5) * 0.05 * scaredLevel;
        playerObject.position.z += (Math.random() - 0.5) * 0.05 * scaredLevel;

        // Apply quaternion slerp as before
        const targetQuaternion = new THREE.Quaternion(
            remotePlayerData.quaternion[0],
            remotePlayerData.quaternion[1],
            remotePlayerData.quaternion[2],
            remotePlayerData.quaternion[3]
        );
        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        targetQuaternion.multiply(rotationQuaternion);

        playerObject.quaternion.slerp(targetQuaternion, 0.5 * this.deltaTime * 60);

        // Update the position of the name label
        const player = this.playersToRender.find(p => p.id === remotePlayerData.id);
        if (player) {
            player.nameLabel.position.set(
                playerObject.position.x,
                playerObject.position.y + 0.40, // Adjust the Y offset as needed
                playerObject.position.z
            );
            player.nameLabel.lookAt(this.camera.position);

            // Check if the name has changed
            if (player.name !== remotePlayerData.name) {
                player.name = remotePlayerData.name; // Update stored name
                // Remove old label
                this.entityScene.remove(player.nameLabel);
                // Create and add new label
                player.nameLabel = this.createTextSprite(remotePlayerData.name.toString());
                player.nameLabel.position.set(
                    playerObject.position.x,
                    playerObject.position.y + 0.40,
                    playerObject.position.z
                );
                this.entityScene.add(player.nameLabel);
            }
        }
    }

    private addNewPlayer(remotePlayerData: RemotePlayerData): void {
        const object = this.possumMesh!.clone();
        const sphere = this.sphere.clone();

        // Create a text sprite for the player's name
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

        // Initialize groundTruthPosition for the new player
        this.groundTruthPositions[remotePlayerData.id] = new THREE.Vector3(
            remotePlayerData.position.x,
            remotePlayerData.position.y,
            remotePlayerData.position.z
        );
    }

    private removeInactivePlayers(remotePlayerData: RemotePlayer[]): void {
        this.playersToRender = this.playersToRender.filter((player) => {
            const isActive = remotePlayerData.some((remotePlayer) => remotePlayer.id === player.id);
            if (!isActive) {
                this.entityScene.remove(player.object);
                this.entityScene.remove(player.nameLabel);
                this.sphereScene.remove(player.sphere);
                // Remove associated data for the player
                delete this.groundTruthPositions[player.id];
                delete this.isAnimating[player.id];
                delete this.animationPhase[player.id];
                delete this.previousVelocity[player.id];
                delete this.lastRunningYOffset[player.id];
            }
            return isActive;
        });
    }

    private createTextSprite(text: string): THREE.Sprite {
        text = text.replace(/&[0123456789abcdef]/g, ''); // Remove color codes
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        const fontSize = 64;
        context.font = `${fontSize}px Comic Sans MS`;

        // Measure the text width and set canvas size accordingly
        const textWidth = context.measureText(text).width;
        canvas.width = textWidth * 2; // Increase resolution
        canvas.height = fontSize * 2; // Increase resolution

        // Redraw the text on the canvas
        context.font = `${fontSize}px Comic Sans MS`;
        context.fillStyle = 'rgba(255,255,255,1)';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);

        // Adjust the sprite scale to match the canvas aspect ratio
        sprite.scale.set((textWidth / fontSize ) * 0.4 , 0.4, 0.4);

        return sprite;
    }


    public getRemotePlayerIDsInCrosshair(): number[] {
        const shotVectors = this.getShotVectorsToPlayersInCrosshair();
        const playerIDs = shotVectors.map(shot => shot.playerID);
        return playerIDs;
    }

    public getShotVectorsToPlayersInCrosshair(): { playerID: number, vector: THREE.Vector3, hitPoint: THREE.Vector3 }[] {
        const shotVectors: { playerID: number, vector: THREE.Vector3, hitPoint: THREE.Vector3 }[] = [];
        const objectsInCrosshair = this.getPlayersInCrosshairWithWalls();

        for (const object of objectsInCrosshair) {
            for (const player of this.playersToRender) {
                if (player.objectUUID === object.uuid) {
                    // Find the intersection point on the player
                    const intersection = this.findIntersectionOnPlayer(object);
                    if (intersection) {
                        const vector = new THREE.Vector3().subVectors(intersection.point, this.camera.position);
                        const hitPoint = intersection.point.clone(); // World coordinates of the hit
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
            return intersects[0]; // Return the first intersection point
        }
        return null;
    }

    private getPlayersInCrosshairWithWalls(): THREE.Object3D[] {
        this.raycaster.setFromCamera(this.crosshairVec, this.camera);

        const playerIntersects = this.raycaster.intersectObjects(this.entityScene.children);
        this.raycaster.firstHitOnly = true;
        const wallIntersects = this.raycaster.intersectObjects([RemotePlayerRenderer.map]);
        this.raycaster.firstHitOnly = false;

        const filteredIntersects = playerIntersects.filter((playerIntersect) => {
            for (const wallIntersect of wallIntersects) {
                if (wallIntersect.distance < playerIntersect.distance) {
                    return false;
                }
            }
            return true;
        });

        return filteredIntersects.map((intersect) => intersect.object);
    }

    public getPlayerSpheresInCrosshairWithWalls(): THREE.Object3D[] {
        this.raycaster.setFromCamera(this.crosshairVec, this.camera);

        this.sphereScene.updateMatrixWorld();

        this.raycaster.firstHitOnly = true;
        const playerIntersects = this.raycaster.intersectObjects(this.sphereScene.children);
        const wallIntersects = this.raycaster.intersectObjects([RemotePlayerRenderer.map]);
        this.raycaster.firstHitOnly = false;

        const filteredIntersects = playerIntersects.filter((playerIntersect) => {
            for (const wallIntersect of wallIntersects) {
                if (wallIntersect.distance < playerIntersect.distance) {
                    return false;
                }
            }
            return true;
        });

        return filteredIntersects.map((intersect) => intersect.object);
    }

    public getShotVectorsToPlayersWithOffset(yawOffset: number, pitchOffset: number): { playerID: number, vector: THREE.Vector3, hitPoint: THREE.Vector3 }[] {
        const shotVectors: { playerID: number, vector: THREE.Vector3, hitPoint: THREE.Vector3 }[] = [];
        const offsetDirection = this.calculateOffsetDirection(yawOffset, pitchOffset);

        // Set the raycaster with the offset direction
        this.raycaster.set(this.camera.position, offsetDirection);

        // Intersect with all potential targets (players and walls)
        const playerIntersects = this.raycaster.intersectObjects(this.playersToRender.map(p => p.object), true);
        this.raycaster.firstHitOnly = true;
        const wallIntersects = this.raycaster.intersectObjects([RemotePlayerRenderer.map]);
        this.raycaster.firstHitOnly = false;

        // Filter player intersections based on wall intersections
        const filteredPlayerIntersects = playerIntersects.filter((playerIntersect) => {
            for (const wallIntersect of wallIntersects) {
                if (wallIntersect.distance < playerIntersect.distance) {
                    return false; // A wall is blocking the player
                }
            }
            return true; // No wall is blocking the player
        });

        // Process the filtered player intersections
        for (const intersect of filteredPlayerIntersects) {
            const player = this.playersToRender.find(p => p.object === intersect.object);
            if (player) {
                const vector = new THREE.Vector3().subVectors(intersect.point, this.camera.position);
                const hitPoint = intersect.point.clone(); // World coordinates of the hit
                shotVectors.push({ playerID: player.id, vector, hitPoint });
            }
        }

        return shotVectors;
    }


    private calculateOffsetDirection(yawOffset: number, pitchOffset: number): THREE.Vector3 {
        // Get the camera's current direction
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        // Create a quaternion for the yaw and pitch offsets
        const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);
        const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchOffset);

        // Apply the rotations
        direction.applyQuaternion(yawQuaternion);
        direction.applyQuaternion(pitchQuaternion);

        return direction.normalize();
    }

    private findIntersectionOnPlayerWithOffset(playerObject: THREE.Object3D, offsetDirection: THREE.Vector3): THREE.Intersection | null {
        // Set the raycaster with the offset direction
        this.raycaster.set(this.camera.position, offsetDirection);

        const intersects = this.raycaster.intersectObject(playerObject, true);
        if (intersects.length > 0) {
            return intersects[0]; // Return the first intersection point
        }
        return null;
    }

    public static setMap(map: THREE.Mesh) {
        this.map = map;
    }
}
