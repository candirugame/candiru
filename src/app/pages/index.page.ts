import {
	AfterViewInit,
	ChangeDetectorRef,
	Component,
	ElementRef,
	HostListener,
	QueryList,
	ViewChildren,
} from '@angular/core';
import { GameComponent } from '../game/game.component.ts';
import { MenuComponent } from '../ui/menu.component.ts';
import { CommonModule } from '@angular/common';

@Component({
	selector: 'app-home',
	standalone: true,
	template: `
		<div class="game-container" [ngClass]="'games-' + gameCount">
			<div *ngFor="let i of [].constructor(gameCount); let idx = index" 
				class="game-frame" 
				[ngClass]="'game-' + (idx + 1)"
				(mouseenter)="setActiveGameFrame(idx)" 
				(click)="setActiveGameFrame(idx)">
				<div #gameContainers class="game-mount"></div>
<!--				<div class="game-label">Game {{idx + 1}}</div>-->
			</div>
		</div>

		<app-menu [visible]="showMenu"
				  (close)="showMenu = false"
				  (menuVisibilityChange)="onMenuVisibilityChange($event)"
				  (changeGameCount)="setGameCount($event)"
				  [networking]="games[0]?.networking"></app-menu>
	`,
	styles: `
		.game-container {
			width: 100vw;
			height: 100vh;
			display: grid;
			gap: 4px;
			background-color: #111;
		}

		.game-frame {
			position: relative;
			overflow: hidden;
			border: 1px solid #333;
			transition: z-index 0.1s;
		}
		
		.game-mount {
			width: 100%;
			height: 100%;
		}
		
		.game-label {
			position: absolute;
			top: 5px;
			left: 5px;
			background-color: rgba(0,0,0,0.5);
			color: white;
			padding: 2px 6px;
			border-radius: 4px;
			font-size: 12px;
			pointer-events: none;
			opacity: 0.7;
		}

		/* One game - fullscreen */
		.games-1 {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr;
		}
		
		.games-1 .game-label {
			display: none;
		}

		/* Two games - side by side */
		.games-2 {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 1fr;
		}

		/* Three or four games - quadrants */
		.games-3, .games-4 {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 1fr 1fr;
		}

		/* Hide last frame if only 3 games */
		.games-3 .game-frame:nth-child(4) {
			display: none;
		}
	`,
	imports: [MenuComponent, CommonModule],
})
export default class HomeComponent implements AfterViewInit {
	showMenu = false;
	gameCount = 1;
	games: GameComponent[] = [];
	activeGameIndex = 0;

	@ViewChildren('gameContainers')
	gameContainers!: QueryList<ElementRef>;

	constructor(private cdr: ChangeDetectorRef) {}

	ngAfterViewInit() {
		this.createGames();
	}

	setActiveGameFrame(index: number) {
		this.activeGameIndex = index;
		// Set z-index for all game frames
		document.querySelectorAll('.game-frame').forEach((el, idx) => {
			(el as HTMLElement).style.zIndex = idx === index ? '10' : '1';
		});
	}

	createGames() {
		// Destroy any existing games
		this.games.forEach((game) => {
			if (game) game.destroy();
		});
		this.games = [];

		// Wait for containers to be available
		setTimeout(() => {
			// Create new games in each container
			this.gameContainers.forEach((container, index) => {
				if (index < this.gameCount) {
					const containerElement = container.nativeElement;
					// Create a new Game instance
					const game = new GameComponent();
					this.games.push(game);

					// Initialize the game with the container element
					game.init(containerElement);

					// Set up event listeners
					game.pointerLockChange.subscribe((isLocked: boolean) => {
						this.onPointerLockChange(isLocked);
					});
				}
			});
			this.cdr.detectChanges();
			this.setActiveGameFrame(0); // Set first game as active
		}, 0);
	}

	setGameCount(count: number) {
		this.gameCount = count;
		// The view will update first, then we'll create games in ngAfterViewChecked
		this.cdr.detectChanges();
		setTimeout(() => {
			this.createGames();
			// Give the layout time to update, then trigger a resize on all games
			setTimeout(() => {
				this.games.forEach((game) => {
					if (game) game.onResize();
				});
			}, 100);
		}, 0);
	}

	// Add to class
	@HostListener('document:keydown', ['$event'])
	handleKeyboardEvent(event: KeyboardEvent) {
		// Escape key shows menu
		if (event.key === 'Escape') {
			this.showMenu = true;
			document.exitPointerLock();
		}

		// WASD locks pointer if menu is visible
		if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase()) && this.showMenu) {
			this.showMenu = false;
			document.body.requestPointerLock();
		}
	}

	// Update pointer lock handler
	onPointerLockChange(isLocked: boolean) {
		this.showMenu = !isLocked;
		if (!isLocked) {
			document.exitPointerLock();
		}
	}

	// Handle menu visibility change
	onMenuVisibilityChange(isMenuOpen: boolean) {
		for (const game of this.games) {
			game.onMenuVisibilityChange(isMenuOpen);
		}
	}
}
