export interface InventoryItem {
	itemId: number;
	durability: number; //item "dies" if this reaches zero. either set to (shotsFired / shotsAvailable) or (creationTimestamp - currentTimestamp) / lifetime
	creationTimestamp: number;
	shotsFired: number;
	overflow: number; //extra items

	lifetime?: number;
	shotsAvailable?: number;
}
