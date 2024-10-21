import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Player } from './Player.ts';

interface RemotePlayerData {
    health: number;
    id: number;
    velocity: { x: number; y: number; z: number };
    position: { x: number; y: number; z: number };
    quaternion: [number, number, number, number]; // Add quaternion as required
    forced: boolean;
}

interface RemotePlayer extends Omit<RemotePlayerData, 'quaternion'> {
    quaternion?: [number, number, number, number]; // Optional in case it's missing
}

interface PlayerToRender {
    id: number;
    object: THREE.Object3D;
    objectUUID: string;
}

export class RemotePlayerRenderer {
    private entityScene: THREE.Scene;
    private playersToRender: PlayerToRender[];
    private possumGLTFScene: THREE.Group | undefined;
    private loader: GLTFLoader;
    private dracoLoader: DRACOLoader;

    private raycaster: THREE.Raycaster;
    private camera: THREE.Camera;
    private scene: THREE.Scene;

    private isAnimating: { [id: number]: boolean };
    private animationPhase: { [id: number]: number };
    private previousVelocity: { [id: number]: number };
    private lastRunningYOffset: { [id: number]: number };

    private groundTruthPositions: { [id: number]: THREE.Vector3 };

    private networking: Networking;
    private localPlayer: Player;
    private deltaTime: number = 0; // Initialize deltaTime to avoid Deno error

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

        this.loader = new GLTFLoader();
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('/draco/');
        this.loader.setDRACOLoader(this.dracoLoader);

        this.possumGLTFScene = undefined;
        this.loader.load(
            'models/simplified_possum.glb',
            (gltf) => {
                this.possumGLTFScene = gltf.scene;
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
        if (!this.possumGLTFScene) return;

        const remotePlayerData: RemotePlayer[] = this.networking.getRemotePlayerData();
        const localPlayerId = this.localPlayer.id;

        remotePlayerData.forEach((remotePlayer) => {
            if (remotePlayer.id === localPlayerId) return;

            const playerDataWithQuaternion: RemotePlayerData = {
                ...remotePlayer,
                quaternion: remotePlayer.quaternion || [0, 0, 0, 1], // Provide default quaternion if missing
            };

            const existingPlayer = this.playersToRender.find((player) => player.id === remotePlayer.id);
            if (existingPlayer) {
                this.updatePlayerPosition(existingPlayer.object, playerDataWithQuaternion);
            } else {
                this.addNewPlayer(playerDataWithQuaternion);
            }
        });

        this.removeInactivePlayers(remotePlayerData);
    }

    private updatePlayerPosition(playerObject: THREE.Object3D, remotePlayerData: RemotePlayerData): void {
        const velocity = Math.sqrt(
            Math.pow(remotePlayerData.velocity.x, 2) +
            Math.pow(remotePlayerData.velocity.y, 2) +
            Math.pow(remotePlayerData.velocity.z, 2)
        );

        const playerId = remotePlayerData.id;
        const prevVelocity = this.previousVelocity[playerId] || 0;

        if (prevVelocity === 0 && velocity > 0) {
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

        // Apply animation offsets (e.g., yOffset)
        if (this.isAnimating[playerId]) {
            const frequency = 25;
            this.animationPhase[playerId] += this.deltaTime * frequency;

            const amplitude = 0.08;
            const yOffset = amplitude * (1 + Math.cos(this.animationPhase[playerId]));

            playerObject.position.y += yOffset;
            this.lastRunningYOffset[playerId] = yOffset;

            if (velocity === 0 && Math.cos(this.animationPhase[playerId]) <= 0) {
                this.isAnimating[playerId] = false;
                this.lastRunningYOffset[playerId] = 0;
            }
        } else {
            this.lastRunningYOffset[playerId] = 0;
        }

        //Apply scared effect
        const scaredLevel = 1-Math.pow(remotePlayerData.health / 100,2); //0-1
        playerObject.position.x += (Math.random() - 0.5 ) * 0.05 * scaredLevel;
        playerObject.position.y += (Math.random() - 0.5 ) * 0.05 * scaredLevel;
        playerObject.position.z += (Math.random() - 0.5 ) * 0.05 * scaredLevel;


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
    }

    private addNewPlayer(remotePlayerData: RemotePlayerData): void {
        const object = this.possumGLTFScene!.children[0].clone();
        const newPlayer: PlayerToRender = {
            id: remotePlayerData.id,
            object: object,
            objectUUID: object.uuid,
        };
        this.playersToRender.push(newPlayer);
        this.entityScene.add(newPlayer.object);

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

    public getRemotePlayerObjectsInCrosshair(raycaster: THREE.Raycaster, camera: THREE.Camera): THREE.Object3D[] {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        return raycaster.intersectObjects(this.entityScene.children).map((intersect) => intersect.object);
    }

    public getRemotePlayerIDsInCrosshair(): number[] {
        const playerIDs: number[] = [];
        const objectsInCrosshair = this.getPlayersInCrosshairWithWalls();

        for (const object of objectsInCrosshair) {
            for (const player of this.playersToRender) {
                if (player.objectUUID === object.uuid) {
                    if (!playerIDs.includes(player.id)) playerIDs.push(player.id);
                    break;
                }
            }
        }

        return playerIDs;
    }

    private getPlayersInCrosshairWithWalls(): THREE.Object3D[] {
        this.raycaster.setFromCamera(this.crosshairVec, this.camera);

        const playerIntersects = this.raycaster.intersectObjects(this.entityScene.children);
        const wallIntersects = this.raycaster.intersectObjects(this.scene.children);

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
}