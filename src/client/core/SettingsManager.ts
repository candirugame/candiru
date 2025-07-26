export class SettingsManager {
	static settings: Settings;

	static {
		SettingsManager.reset();
		const settingsJson = localStorage.getItem('settings');
		if (settingsJson) SettingsManager.settings = JSON.parse(settingsJson);
	}

	public static write(): void {
		localStorage.setItem('settings', JSON.stringify(SettingsManager.settings));
	}

	public static reset() {
		SettingsManager.settings = {
			sense: 1,
			zoomSensT: 1,
			controllerSense: 1,
			name: null,
			crosshairColor: '#00ffff',
			crosshairType: 1,
			crosshairOpacity: 1,
			viewBobbingStrength: 1,
			chatOpacity: 0.7,
			chatMaxLines: 10,
			doPrettyText: false,
			developerMode: false,
		};
	}

	constructor() {
		throw Error('Settings class is static.');
	}
}

interface Settings {
	sense: number;
	controllerSense: number;
	zoomSensT: number; // zoom is lerped from 1 to camera zoom, with this as the t value
	name: null | string;
	crosshairColor: string;
	crosshairType: number;
	crosshairOpacity: number;
	viewBobbingStrength: number;
	chatOpacity: number;
	chatMaxLines: number;
	doPrettyText: boolean;
	developerMode: boolean;
}
