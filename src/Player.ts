import * as THREE from 'three';

export class Player {
    public position: THREE.Vector3;
    public velocity: THREE.Vector3;
    public quaternion: THREE.Quaternion;
    public id: number;
    public gameVersion: string;
    public name: string;
    public speed: number;
    public chatActive: boolean;
    public chatMsg: string;
    public latency: number;
    public health: number;
    public forced: boolean;
    public forcedAcknowledged: boolean;

    constructor() {
        this.position = new THREE.Vector3(6, 2, 12);
        this.velocity = new THREE.Vector3();
        this.quaternion = new THREE.Quaternion();
        this.id = Math.floor(Math.random() * 10000);
        this.gameVersion = '';
        this.name = '';
        this.speed = 5;
        this.chatActive = false;
        this.chatMsg = '';
        this.latency = 1000;
        this.health = 100;
        this.forced = false;
        this.forcedAcknowledged = false;

        if (this.name === '') {
            const storedName = localStorage.getItem('name');
            if (storedName) this.name = storedName;
        }
    }
}