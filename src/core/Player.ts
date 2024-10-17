import * as THREE from 'three';

export class Player {
    public position: THREE.Vector3;
    public velocity: THREE.Vector3;
    public gravity: number;
    public lookQuaternion: THREE.Quaternion;
    public quaternion: THREE.Quaternion;
    public id: number;
    public gameVersion: string;
    public name: string;
    public speed: number;
    public acceleration: number;
    public chatActive: boolean;
    public chatMsg: string;
    public latency: number;
    public health: number;
    public forced: boolean;
    public forcedAcknowledged: boolean;
    public inventory: number[];

    constructor() {
        this.position = new THREE.Vector3(0,0,0);
        this.velocity = new THREE.Vector3();
        this.gravity = 0;
        this.lookQuaternion = new THREE.Quaternion();
        this.quaternion = new THREE.Quaternion();
        this.id = Math.floor(Math.random() * 10000);
        this.gameVersion = '';
        this.name = '';
        this.speed = 5;
        this.acceleration = 100;
        this.chatActive = false;
        this.chatMsg = '';
        this.latency = 1000;
        this.health = 100;
        this.forced = false;
        this.forcedAcknowledged = false;
        this.inventory = [];

        if (this.name === '') {
            const storedName = localStorage.getItem('name');
            if (storedName) this.name = storedName;
        }
    }
}