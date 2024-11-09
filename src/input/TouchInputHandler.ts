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
    private lookFingerId: number = -1;

    private lastLookX: number = 0;
    private lastLookY: number = 0;

    private lastLookChangeX: number = 0;
    private lastLookChangeY: number = 0;

    private buttonsHeld: {button:number, fingerId: number}[] = [];


    constructor(inputHandler: InputHandler, chatOverlay: ChatOverlay) {
        this.inputHandler = inputHandler;
        this.chatOverlay = chatOverlay
        this.setupEventListeners();


    }

    public onFrame() {
        this.chatOverlay.setLastTouchTimestamp(this.lastTouchTimestamp);
        this.chatOverlay.setTouchJoystickEngaged(this.joystickFingerId !== -1);
        this.chatOverlay.setJoystickPosition(this.joystickX, this.joystickY);
        this.chatOverlay.setJoystickInput(this.joystickInputX, this.joystickInputY);
        this.chatOverlay.setButtonsHeld(this.buttonsHeld.map((button) => button.button));

        this.inputHandler.setTouchJoyInput(this.joystickInputX, this.joystickInputY);
        this.inputHandler.setLastTouchLookDelta(this.lastLookChangeX, this.lastLookChangeY);
        this.inputHandler.setButtonsHeld(this.buttonsHeld.map((button) => button.button));
        this.lastLookChangeX = 0; this.lastLookChangeY = 0;
        if(this.joystickFingerId == -1) {
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

            if(this.joystickFingerId == -1){
                if (touchX < globalThis.innerWidth * pixelRatio / 2.5) {

                    this.joystickFingerId = event.touches[i].identifier;
                    this.joystickX = touchX;
                    this.joystickY = touchY;
                    continue;
                }
            }
            if(this.lookFingerId == -1){
                if (touchX > globalThis.innerWidth * pixelRatio / 2.5 && touchX < globalThis.innerWidth * pixelRatio - 30) {
                    this.lookFingerId = event.touches[i].identifier;
                    this.lastLookX = touchX;
                    this.lastLookY = touchY;
                    continue;
                }
            }


        }
        this.onTouchMove(event);
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
                continue;
            }

            if (event.touches[i].identifier === this.lookFingerId) {

                this.lastLookChangeX = touchX - this.lastLookX;
                this.lastLookChangeY = touchY - this.lastLookY;

                this.lastLookX = touchX;
                this.lastLookY = touchY;
                continue;
            }

            if(touchX > globalThis.innerWidth * pixelRatio - 30) {
                const buttonClosestTo = Math.round((touchY - 100) / 30);

                let found = false;
                for(let j = 0; j < this.buttonsHeld.length; j++)
                    if(this.buttonsHeld[j].button === buttonClosestTo){
                        this.buttonsHeld[j].fingerId = event.touches[i].identifier;
                        found = true;
                    }
                if(!found)
                    this.buttonsHeld.push({button: buttonClosestTo, fingerId: event.touches[i].identifier});



            }




        }

    }

    private onTouchEnd(event: TouchEvent) {
        if(event.touches.length === 0) {
            this.joystickFingerId = -1;
            this.lookFingerId = -1;
        }
        for(let i = 0; i < event.changedTouches.length; i++) {
            if (event.changedTouches[i].identifier === this.joystickFingerId)
                this.joystickFingerId = -1;
            if (event.changedTouches[i].identifier === this.lookFingerId)
                this.lookFingerId = -1;

            for(let j = 0; j < this.buttonsHeld.length; j++)
                if(this.buttonsHeld[j].fingerId === event.changedTouches[i].identifier)
                    this.buttonsHeld.splice(j, 1);
                    //this.buttonsHeld[j].fingerId = -1;

        }

    }

    public getButtonState(button: number): boolean {
        for(let i = 0; i < this.buttonsHeld.length; i++)
            if(this.buttonsHeld[i].button === button && this.buttonsHeld[i].fingerId !== -1)
                return true;
        return false;

    }

    private getPixelRatio(): number {
        return 200 / globalThis.innerHeight;
    }




}
