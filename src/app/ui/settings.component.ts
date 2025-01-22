import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsManager } from '../../client/core/SettingsManager.ts';

@Component({
	selector: 'app-settings',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="h-full">
			<h2 class="text-xl text-gray-100 mb-4">Settings</h2>
			<div class="space-y-4 h-full">
				<div class="setting-item flex-nowrap">
					<label class="truncate">Sensitivity</label>
					<div class="flex items-center gap-4 min-w-[160px]">
						<input type="range" min="0.1" max="2" step="0.1"
							   [(ngModel)]="settings.sense" (change)="saveSettings()">
						<span class="text-gray-200 min-w-[40px] text-right">
                            {{ settings.sense | number:'1.1-1' }}
                        </span>
					</div>
				</div>
				<button class="btn-menu" (click)="back.emit()">Back</button>
			</div>
		</div>
	`,
	styles: [`
		.setting-item {
			@apply flex justify-between items-center mb-4 text-gray-200;
		}
		.btn-menu {
			@apply w-full text-left px-4 py-2 text-gray-100 hover:bg-gray-700/50 transition-colors mb-2;
			border-radius: 0;
		}
	`],
})
export class SettingsComponent {
	@Output()
	back = new EventEmitter<void>();
	settings = { ...SettingsManager.settings };

	saveSettings() {
		SettingsManager.settings = this.settings;
		SettingsManager.write();
	}
}
