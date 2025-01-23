import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
	selector: 'app-browse',
	standalone: true,
	imports: [CommonModule],
	template: `
		<div class="h-full">
			<h2 class="text-xl text-gray-100 mb-4">internet (for possum)</h2>
			<div class="space-y-4 h-full">
				<div class="server-item whitespace-nowrap overflow-hidden text-ellipsis">
					possum world
				</div>
				<div class="server-item whitespace-nowrap overflow-hidden text-ellipsis">
					possum world 2
				</div>
				<button class="btn-menu" (click)="back.emit()">back</button>
			</div>
		</div>
	`,
	styleUrls: ['./menu-styles.css'],
})
export class BrowseComponent {
	@Output()
	back = new EventEmitter<void>();
}
