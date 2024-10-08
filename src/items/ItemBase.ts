import {HeldItemInput} from "../input/HeldItemInput";

export abstract class ItemBase {
    protected constructor(index: number) {
        this.index = index;
    }
    abstract init(): void;
    abstract onFrame(input:HeldItemInput): void;
    private readonly index: number;
    public getIndex(): number {return this.index;}
    abstract hideInHand(): void;
    abstract showInHand(): void;

    abstract showInInventory(): void;
    abstract hideInInventory(): void;
    abstract selectedInInventory(): void;

    abstract itemDepleted(): boolean;
}