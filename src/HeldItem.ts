import { HeldItemInput } from './HeldItemInput';

export abstract class HeldItem {
    constructor() {}
    abstract init(): void;
    abstract onFrame(input: HeldItemInput): void;
    abstract hide(): void;
    abstract show(): void;
    abstract itemDepleted(): boolean;
}