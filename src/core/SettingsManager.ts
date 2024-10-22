export class SettingsManager {
    static settings: { [key: string]: string | number | boolean | null};

    static {
        SettingsManager.reset()
        const settingsJson = localStorage.getItem('settings');
        if (settingsJson) SettingsManager.settings = JSON.parse(settingsJson);
    }

    public static write(): void {
        localStorage.setItem('settings', JSON.stringify(SettingsManager.settings));
        console.log(localStorage.getItem('settings'));
    }

    public static reset() {
        SettingsManager.settings = {
            sense: .002,
            name: null,
        };
    }

    constructor() {
        throw Error('Settings class is static.');
    }
}