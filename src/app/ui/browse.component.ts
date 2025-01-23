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
					FFA-0 (release)
					<button class="join-btn" (click)="navigateToUrl('https://candiru.xyz')">join</button>
				</div>
				<div class="server-item whitespace-nowrap overflow-hidden text-ellipsis">
					FFA-1 (beta)
					<button class="join-btn" (click)="navigateToUrl('https://dev.candiru.xyz')">join</button>
				</div>
				<div class="server-item whitespace-nowrap overflow-hidden text-ellipsis">
					CTF-0 (beta)
					<button class="join-btn" (click)="navigateToUrl('https://ctf.candiru.xyz')">join</button>
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
	navigateToUrl(url: string): void {
		globalThis.location.href = url;
	}
}
