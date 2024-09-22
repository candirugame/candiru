class BananaGun extends HeldItem {
    scene: THREE.Scene = null;
    possumGLTFScene = null;

    constructor(scene: THREE.Scene) {
        super(); // Assuming HeldItem is a class
        this.scene = scene;
        this.init();
    }

    init() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        loader.setDRACOLoader(dracoLoader);

        loader.load(
            'models/simplified_banana_1.glb',
            (gltf) => {
                this.possumGLTFScene = gltf.scene;
            },
            () => {}, //progress callback
            () => { console.log('banana loading error'); }
        );
    }

    onFrame(input: HeldItemInput) {
        if (input.leftClick) {
            console.log('banana gun shoots!');
        }
    }
}
