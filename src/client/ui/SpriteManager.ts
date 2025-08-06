export class SpriteManager {
	private spriteSheet: HTMLImageElement = new Image();
	private spriteDefinitions: Record<string, { x: number; y: number; width: number; height: number }> = {
		'redguy_6px': { x: 0, y: 0, width: 6, height: 6 },
		'redguy_8px': { x: 7, y: 0, width: 8, height: 8 },
		'yellowguy': { x: 16, y: 0, width: 8, height: 8 },

		'redguy': { x: 0, y: 8, width: 58, height: 58 },
	};
	constructor() {
		this.spriteSheet.src = '/spritesheet.png'; //TODO: replace with webp
	}
	public renderSprite(
		ctx: CanvasRenderingContext2D,
		spriteName: string,
		x: number,
		y: number,
		w?: number,
		h?: number,
	) {
		const sprite = this.spriteDefinitions[spriteName];
		if (!sprite) {
			console.warn(`Sprite "${spriteName}" not found`);
			return;
		}
		if (!this.spriteSheet.complete) {
			console.warn(`Sprite sheet not loaded yet: ${this.spriteSheet.src}`);
			return;
		}

		const destW = w ?? sprite.width;
		const destH = h ?? sprite.height;

		ctx.drawImage(
			this.spriteSheet,
			sprite.x,
			sprite.y,
			sprite.width,
			sprite.height, // Source rectangle
			x,
			y,
			destW,
			destH, // Destination rectangle (uses optional w/h or defaults)
		);
	}
}
