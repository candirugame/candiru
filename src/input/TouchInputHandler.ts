import {InputHandler} from "./InputHandler.ts";
import {ChatOverlay} from "../ui/ChatOverlay.ts";

export class TouchInputHandler {
    public static joystickRadius = 30;

    private lastTouchTimestamp: number = 0;
    private inputHandler: InputHandler;
    private chatOverlay: ChatOverlay;

    private joystickX: number = 0;
    private joystickY: number = 0;

    private joystickInputX: number = 0;
    private joystickInputY: number = 0;

    private joystickFingerId: number = -1;


    private currentlyEngagedWithJoystick: boolean = false;


    constructor(inputHandler: InputHandler, chatOverlay: ChatOverlay) {
        this.inputHandler = inputHandler;
        this.chatOverlay = chatOverlay
        this.setupEventListeners();


    }

    public onFrame() {
        this.chatOverlay.setLastTouchTimestamp(this.lastTouchTimestamp);
        this.chatOverlay.setTouchJoystickEngaged(this.currentlyEngagedWithJoystick);
        this.chatOverlay.setJoystickPosition(this.joystickX, this.joystickY);
        this.inputHandler.setTouchJoyInput(this.joystickInputX, this.joystickInputY);
        if(!this.currentlyEngagedWithJoystick) {
            this.joystickInputX = 0;
            this.joystickInputY = 0;
        }
    }

    private setupEventListeners() {
        document.addEventListener('touchstart', this.onTouchStart.bind(this), false);
        document.addEventListener('touchmove', this.onTouchMove.bind(this), false);
        document.addEventListener('touchend', this.onTouchEnd.bind(this), false);
    }

    private onTouchStart(event: TouchEvent) {
        this.lastTouchTimestamp = Date.now()/1000;

        for (let i = 0; i < event.touches.length; i++) {

            const pixelRatio = this.getPixelRatio();
            const touchX = event.touches[i].clientX * pixelRatio;
            const touchY = event.touches[i].clientY * pixelRatio;
           // console.log(touchX, touchY);

            if(!this.currentlyEngagedWithJoystick){
                // const touchedExistingJoystick = Math.sqrt(Math.pow(touchX - this.joystickX, 2) + Math.pow(touchY - this.joystickY, 2)) < TouchInputHandler.joystickRadius;
                //
                // if (touchedExistingJoystick) {
                //     this.currentlyEngagedWithJoystick = true;
                //     this.joystickFingerId = event.touches[i].identifier;
                //     continue;
                // }

                if (touchX < globalThis.innerWidth * pixelRatio / 2.5) {
                    this.currentlyEngagedWithJoystick = true;
                    this.joystickFingerId = event.touches[i].identifier;
                    this.joystickX = touchX;
                    this.joystickY = touchY;
                    continue;
                }
            }


        }
    }

    private onTouchMove(event: TouchEvent) {
        this.lastTouchTimestamp = Date.now()/1000;

        for (let i = 0; i < event.touches.length; i++) {

            const pixelRatio = this.getPixelRatio();
            const touchX = event.touches[i].clientX * pixelRatio;
            const touchY = event.touches[i].clientY * pixelRatio;

            if (event.touches[i].identifier === this.joystickFingerId) {
                this.joystickInputX = (touchX - this.joystickX) / TouchInputHandler.joystickRadius;
                this.joystickInputY = (touchY - this.joystickY) / TouchInputHandler.joystickRadius;

                const mag = Math.sqrt(this.joystickInputX * this.joystickInputX + this.joystickInputY * this.joystickInputY);
                const dir = Math.atan2(this.joystickInputY, this.joystickInputX);
                if(mag > 1) {
                    this.joystickInputX = Math.cos(dir);
                    this.joystickInputY = Math.sin(dir);
                }
            }
            }

    }

    private onTouchEnd(event: TouchEvent) {
        if(event.touches.length === 0) {
            this.currentlyEngagedWithJoystick = false;
            this.joystickFingerId = -1;
        }
        for(let i = 0; i < event.changedTouches.length; i++) {
            if (event.changedTouches[i].identifier === this.joystickFingerId) {
                this.currentlyEngagedWithJoystick = false;
                this.joystickFingerId = -1;
            }
        }
    }

    private getPixelRatio(): number {
        return 200 / globalThis.innerHeight;
    }




}
