export class HeldItemInput {
    public leftClick: boolean = false;
    public rightClick: boolean = false;
    public shiftKey: boolean = false;

    constructor(leftClick: boolean = false, rightClick: boolean = false, shiftKey: boolean = false) {
        this.leftClick = leftClick;
        this.rightClick = rightClick;
        this.shiftKey = shiftKey;
    }
}