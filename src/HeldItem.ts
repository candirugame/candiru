export abstract class HeldItem {
    protected constructor() {}
    abstract init(): void;
    abstract onFrame(): void;
    abstract hide(): void;
    abstract show(): void;
    abstract itemDepleted(): boolean;
}