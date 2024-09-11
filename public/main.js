import * as RENDERER from '/js/ren.module.js';
import * as INPUTS from '/js/input.module.js';
import * as NW from '/js/networking.module.js'
import * as THREE from './js/three.module.js';



let localPlayer = {
    object3d : new THREE.Object3D()
};



function animate() {
    INPUTS.handleInputs(localPlayer);
    requestAnimationFrame(animate)
    RENDERER.doFrame();

}

animate();