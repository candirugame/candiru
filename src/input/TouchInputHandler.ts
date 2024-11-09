import {InputHandler} from "./InputHandler.ts";
import {ChatOverlay} from "../ui/ChatOverlay.ts";

export class TouchInputHandler {
    private lastTouchTimestamp: number = 0;
    private inputHandler: InputHandler;
    private chatOverlay: ChatOverlay;

    private joystickX: number = 0;
    private joystickY: number = 0;


    constructor(inputHandler: InputHandler, chatOverlay: ChatOverlay) {
        this.inputHandler = inputHandler;
        this.chatOverlay = chatOverlay
        this.setupEventListeners();

        const canvas = document.getElementById('canvas');

        if (canvas) {
            canvas.addEventListener('touchmove', (event: TouchEvent) => {
                event.preventDefault();
            });

            canvas.addEventListener('touchstart', (event: TouchEvent) => {
                event.preventDefault();
            });
        } else {
            console.error("Canvas element not found");
        }


    }

    public onFrame() {
        this.chatOverlay.setLastTouchTimestamp(this.lastTouchTimestamp);
    }

    private setupEventListeners() {
        document.addEventListener('touchstart', this.onTouchStart.bind(this), false);
        document.addEventListener('touchmove', this.onTouchMove.bind(this), false);
        document.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    }

    private onTouchStart(event: TouchEvent) {
        if (event.touches.length > 0) {
            console.log(event.touches[0].clientX, event.touches[0].clientY);

            this.lastTouchTimestamp = Date.now()/1000;
        }
    }

    private onTouchMove(event: TouchEvent) {
        if (event.touches.length > 0) {
//
            this.lastTouchTimestamp = Date.now()/1000;
        }
    }

    private onTouchEnd() {

    }

    private pixelsToGamePixels(pixels: number): number {
        return pixels * 200 / globalThis.innerHeight;
    }




}
