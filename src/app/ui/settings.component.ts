import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsManager } from '../../client/core/SettingsManager.ts';

@Component({
	selector: 'app-settings',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div>
			<h2 class="text-xl text-gray-100 mb-4">settings</h2>
			<div class="space-y-4">
				<div class="setting-item">
					<label class="mr-2">name</label>
					<input type="text" [(ngModel)]="settings.name" (change)="saveSettings()"
						   class="bg-gray-800 text-white px-2 py-1 rounded">
				</div>

				<div class="setting-item">
					<label class="mr-2">sens (mouse)</label>
					<div class="flex items-center min-w-[160px]">
						<input type="range" min="0.1" max="4" step="0.1"
							   [(ngModel)]="settings.sense" (change)="saveSettings()">
						<span class="w-8 text-left ml-2">{{ settings.sense | number:'1.1-1' }}</span>
					</div>
				</div>

				<div class="setting-item">
					<label class="mr-2">sens (stick)</label>
					<div class="flex items-center min-w-[160px]">
						<input type="range" min="0.1" max="4" step="0.1"
							   [(ngModel)]="settings.controllerSense" (change)="saveSettings()">
						<span class="w-8 text-left ml-2">{{ settings.controllerSense | number:'1.1-1' }}</span>
					</div>
				</div>

				<div class="setting-item">
					<label class="mr-2">crosshair color</label>
					<input type="color" [(ngModel)]="settings.crosshairColor" (change)="saveSettings()"
						   class="h-8 w-12 cursor-pointer border border-gray-600">
				</div>

				<div class="setting-item">
					<label class="mr-2">crosshair type</label>
					<select [(ngModel)]="settings.crosshairType" (change)="saveSettings()"
							class="bg-gray-800 text-white px-2 py-1 rounded">
						<option [ngValue]="1">dot</option>
						<option [ngValue]="0">cross</option>
					</select>
				</div>

				<div class="setting-item">
					<label class="mr-2">bobbing strength</label>
					<div class="flex items-center min-w-[160px]">
						<input type="range" min="0" max="2" step="0.1"
							   [(ngModel)]="settings.viewBobbingStrength" (change)="saveSettings()">
						<span class="w-8 text-left ml-2">{{ settings.viewBobbingStrength | number:'1.1-1' }}</span>
					</div>
				</div>

				<div class="setting-item">
					<label class="mr-2">pretty text</label>
					<input type="checkbox" [(ngModel)]="settings.doPrettyText" (change)="saveSettings()"
						   class="w-4 h-4 accent-cyan-500">
				</div>

				<div class="setting-item">
					<label class="mr-2">developer mode</label>
					<input type="checkbox" [(ngModel)]="settings.developerMode" (change)="saveSettings()"
						   class="w-4 h-4 accent-cyan-500">
				</div>

				<div class="setting-item">
					<button type="button" (click)="resetSettings()"
							class="text-gray-100 hover:bg-gray-700/50 transition-colors px-2 py-1 text-left rounded-none">reset all</button>
				</div>


				<button class="btn-menu" (click)="back.emit()">back</button>
			</div>
		</div>
	`,
	styles: [`
		.setting-item {
			@apply flex justify-between items-center mb-4 text-gray-200;
		}
		.btn-menu {
			@apply  text-left px-2 py-1 text-gray-100 hover:bg-gray-700/50 transition-colors mb-2 rounded-none;
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

	resetSettings() {
		SettingsManager.reset();
		this.settings = { ...SettingsManager.settings }; // Refresh local copy
		SettingsManager.write();
	}
}
