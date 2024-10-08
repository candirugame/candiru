export abstract class ItemBase {
    protected constructor() {}
    abstract init(): void;
    abstract onFrame(): void;
    abstract hide(): void;
    abstract show(): void;
    abstract itemDepleted(): boolean;
}