import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Player } from './Player.ts';

export class RemotePlayerRenderer {
    private entityScene: THREE.Scene;
    private playersToRender;
    private possumGLTFScene: THREE.Group;
    private loader: GLTFLoader;
    private dracoLoader: DRACOLoader;

    private raycaster: THREE.Raycaster;
    private camera: THREE.Camera;
    private scene: THREE.Scene;

    // Animation state tracking variables
    private isAnimating: { [id: number]: boolean };
    private animationPhase: { [id: number]: number };
    private previousVelocity: { [id: number]: number };
    private lastRunningYOffset: { [id: number]: number };

    private networking: Networking;
    private localPlayer: Player;
    private deltaTime: number;

    private crosshairVec = new THREE.Vector2();

    constructor(networking: Networking, localPlayer: Player, raycaster: THREE.Raycaster, camera: THREE.Camera, scene: THREE.Scene) {
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
            () => { console.log('possum loading error'); }
        );

        this.playersToRender = [];

        this.isAnimating = {};
        this.animationPhase = {};
        this.previousVelocity = {};
        this.lastRunningYOffset = {};
    }

    public getEntityScene() {
        return this.entityScene;
    }

    public update(deltaTime: number) {
        this.deltaTime = deltaTime;
        this.updateRemotePlayers();
    }

    private updateRemotePlayers() {
        if (!this.possumGLTFScene) return;

        const remotePlayerData = this.networking.getRemotePlayerData();
        const localPlayerId = this.localPlayer.id;

        // Update existing players and add new players
        remotePlayerData.forEach((remotePlayer) => {
            if (remotePlayer.id === localPlayerId) return;
            const existingPlayer = this.playersToRender.find((player) => player.id === remotePlayer.id);
            if (existingPlayer) {
                this.updatePlayerPosition(existingPlayer.object, remotePlayer);
            } else {
                this.addNewPlayer(remotePlayer);
            }
        });

        // Remove players that are no longer in remotePlayerData
        this.removeInactivePlayers(remotePlayerData);
    }

    private updatePlayerPosition(playerObject: THREE.Object3D, remotePlayerData) {
        // Compute current velocity magnitude
        const velocity = Math.sqrt(
            Math.pow(remotePlayerData.velocity.x, 2) +
            Math.pow(remotePlayerData.velocity.y, 2) +
            Math.pow(remotePlayerData.velocity.z, 2)
        );

        // Retrieve previous velocity (default to 0 if undefined)
        const prevVelocity = this.previousVelocity[remotePlayerData.id] || 0;

        // Check for velocity state changes
        if (prevVelocity === 0 && velocity > 0) {
            // Player started moving
            this.isAnimating[remotePlayerData.id] = true;
            this.animationPhase[remotePlayerData.id] = 0;
        }

        // Update previous velocity for next frame
        this.previousVelocity[remotePlayerData.id] = velocity;

        // Update position based on velocity and deltaTime
        playerObject.position.x += remotePlayerData.velocity.x * this.deltaTime;
        playerObject.position.y += remotePlayerData.velocity.y * this.deltaTime;
        playerObject.position.z += remotePlayerData.velocity.z * this.deltaTime;

        // If forced position, set directly
        if (remotePlayerData.forced) {
            playerObject.position.x = remotePlayerData.position.x;
            playerObject.position.y = remotePlayerData.position.y;
            playerObject.position.z = remotePlayerData.position.z;
        }

        // Lerp position for smooth movement
        playerObject.position.lerp(
            new THREE.Vector3(
                remotePlayerData.position.x,
                remotePlayerData.position.y,
                remotePlayerData.position.z
            ),
            0.3 * this.deltaTime * 60
        );

        // Slerp rotation for smooth orientation changes
        const targetQuaternion = new THREE.Quaternion(
            remotePlayerData.quaternion[0],
            remotePlayerData.quaternion[1],
            remotePlayerData.quaternion[2],
            remotePlayerData.quaternion[3]
        );
        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        targetQuaternion.multiply(rotationQuaternion);

        playerObject.quaternion.slerp(targetQuaternion, 0.5 * this.deltaTime * 60);

        // Apply animation offset after LERP and rotation updates
        if (this.isAnimating[remotePlayerData.id]) {
            // Update animation phase
            const frequency = 25; // Adjust frequency as desired
            this.animationPhase[remotePlayerData.id] += this.deltaTime * frequency;

            // Compute Y offset
            const amplitude = 0.02; // Adjust amplitude as desired
            const yOffset = amplitude * (1 + Math.cos(this.animationPhase[remotePlayerData.id]));

            // Apply new Y offset
            playerObject.position.y += yOffset;
            this.lastRunningYOffset[remotePlayerData.id] = yOffset;

            // Check if we should stop animating
            if (velocity === 0 && Math.cos(this.animationPhase[remotePlayerData.id]) <= 0) {
                // Cosine has crossed zero; stop animating
                this.isAnimating[remotePlayerData.id] = false;
                this.lastRunningYOffset[remotePlayerData.id] = 0;
            }
        } else {
            // Ensure Y offset is reset when not animating
            this.lastRunningYOffset[remotePlayerData.id] = 0;
        }
    }

    private addNewPlayer(remotePlayerData) {
        const object = this.possumGLTFScene.children[0].clone();
        const newPlayer = {
            id: remotePlayerData.id,
            object: object,
            objectUUID: object.uuid
        };
        this.playersToRender.push(newPlayer);
        this.entityScene.add(newPlayer.object); // Add to remote players scene
    }

    private removeInactivePlayers(remotePlayerData) {
        this.playersToRender = this.playersToRender.filter((player) => {
            const isActive = remotePlayerData.some((remotePlayer) => remotePlayer.id === player.id);
            if (!isActive) {
                this.entityScene.remove(player.object); // Remove from remote players scene
            }
            return isActive;
        });
    }

    public getRemotePlayerObjectsInCrosshair(raycaster: THREE.Raycaster, camera: THREE.Camera): THREE.Object3D[] {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); // Assuming crosshair at center
        return raycaster.intersectObjects(this.entityScene.children).map(intersect => intersect.object);
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

        const filteredIntersects = playerIntersects.filter(playerIntersect => {
            for (const wallIntersect of wallIntersects) {
                if (wallIntersect.distance < playerIntersect.distance) {
                    return false;
                }
            }
            return true;
        });

        return filteredIntersects.map(intersect => intersect.object);
    }

}