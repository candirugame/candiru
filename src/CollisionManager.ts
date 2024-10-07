import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Player } from './Player';
import {acceleratedRaycast, computeBoundsTree, disposeBoundsTree, StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';
import {Group, Vector3} from "three";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

export class CollisionManager {
    private clock: THREE.Clock;
    private colliderSphere: THREE.Sphere;
    private deltaVec: THREE.Vector3;
    private raycaster: THREE.Raycaster;
    private scene: THREE.Scene;
    private gravity: number;
    private physicsTickRate: number;
    private physicsTickTimer: number;
    public mapLoaded: boolean = false;
    private staticGenerator: StaticGeometryGenerator;
    private colliderGeom: THREE.BufferGeometry;

    constructor(renderer: Renderer, physicsTickRate: number) {
        this.scene = renderer.getScene();
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        if (physicsTickRate) {
            this.physicsTickRate = physicsTickRate;
        } else {
            this.physicsTickRate = 1/60;
        }
        this.physicsTickTimer = 0;
        this.colliderSphere = new THREE.Sphere(new Vector3(), .2);
        this.deltaVec = new THREE.Vector3();
    }

    public init() {
        this.gravity = 0;
    }

    public collisionPeriodic(localPlayer: Player) {
        if(!this.mapLoaded) {return;}
        const deltaTime: number = this.clock.getDelta();
        this.physics(localPlayer, deltaTime);
    }

    private physics(localPlayer: Player, deltaTime: number) {

        this.physicsTickTimer += deltaTime;

        while(this.physicsTickTimer >= this.physicsTickRate) {

            this.gravity += this.physicsTickRate * - 20;
            localPlayer.velocity.y += this.gravity;
            localPlayer.position.add(localPlayer.velocity.clone().multiplyScalar(this.physicsTickRate));

            const bvh: MeshBVH = this.colliderGeom.boundsTree;
            this.colliderSphere.center = localPlayer.position.clone();

            bvh.shapecast( {

                intersectsBounds: box => {

                    return box.intersectsSphere( this.colliderSphere );

                },

                intersectsTriangle: tri => {

                    // get delta between closest point and center
                    tri.closestPointToPoint( this.colliderSphere.center, this.deltaVec );
                    this.deltaVec.sub( this.colliderSphere.center );
                    const distance = this.deltaVec.length();
                    if ( distance < this.colliderSphere.radius ) {

                    // move the sphere position to be outside the triangle
                    const radius = this.colliderSphere.radius;
                    const depth = distance - radius;
                    this.deltaVec.multiplyScalar( 1 / distance );
                    this.colliderSphere.center.addScaledVector( this.deltaVec, depth );
                    localPlayer.position.addScaledVector( this.deltaVec, depth );
                    localPlayer.velocity.y = 0;
                    this.gravity = 0;
                }
            },

                boundsTraverseOrder: box => {

                    return box.distanceToPoint( this.colliderSphere.center ) - this.colliderSphere.radius;

                },

            } );

            this.physicsTickTimer -= this.physicsTickRate;
        }
    }

    public staticGeometry(group: Group) {
        this.staticGenerator = new StaticGeometryGenerator( group );
        this.staticGenerator.attributes = [ 'position' ];
        this.colliderGeom = this.staticGenerator.generate();
        this.colliderGeom.computeBoundsTree();
        console.log(this.colliderGeom.boundsTree);
        this.mapLoaded = true;
    }
}