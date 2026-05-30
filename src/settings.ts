import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import GCalDailyNotes from './main';
import { startOAuthFlow } from './auth';
import { fetchCalendarList } from './calendar';

export interface CalendarEntry {
	id: string;
	name: string;
	enabled: boolean;
}

export interface GCalSettings {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	calendars: CalendarEntry[];
	insertFormat: string;
}

export const DEFAULT_SETTINGS: GCalSettings = {
	clientId: '',
	clientSecret: '',
	refreshToken: '',
	calendars: [],
	insertFormat: '### {time} — {summary}',
};

export class GCalSettingTab extends PluginSettingTab {
	plugin: GCalDailyNotes;

	constructor(app: App, plugin: GCalDailyNotes) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Google Calendar Daily Notes' });

		// --- Auth ---
		containerEl.createEl('h3', { text: 'Authentication' });

		new Setting(containerEl)
			.setName('Client ID')
			.setDesc('OAuth 2.0 Client ID from Google Cloud Console')
			.addText((text) =>
				text
					.setPlaceholder('xxxx.apps.googleusercontent.com')
					.setValue(this.plugin.settings.clientId)
					.onChange(async (value) => {
						this.plugin.settings.clientId = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Client Secret')
			.setDesc('OAuth 2.0 Client Secret from Google Cloud Console')
			.addText((text) =>
				text
					.setPlaceholder('GOCSPX-...')
					.setValue(this.plugin.settings.clientSecret)
					.onChange(async (value) => {
						this.plugin.settings.clientSecret = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Authorize Google Calendar')
			.setDesc('Opens a browser window to grant calendar read access.')
			.addButton((btn) =>
				btn
					.setButtonText(this.plugin.settings.refreshToken ? 'Re-authorize' : 'Authorize')
					.setCta()
					.onClick(() => {
						startOAuthFlow(this.plugin.settings, async (refreshToken) => {
							this.plugin.settings.refreshToken = refreshToken;
							await this.plugin.saveSettings();
							this.display();
						});
					}),
			);

		new Setting(containerEl)
			.setName('Refresh Token')
			.setDesc('Filled automatically after authorization.')
			.addText((text) =>
				text
					.setPlaceholder('Will be filled after OAuth flow')
					.setValue(this.plugin.settings.refreshToken)
					.onChange(async (value) => {
						this.plugin.settings.refreshToken = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		// --- Calendars ---
		containerEl.createEl('h3', { text: 'Calendars' });

		new Setting(containerEl)
			.setName('Load calendars')
			.setDesc('Fetch your calendar list from Google so you can enable or disable each one.')
			.addButton((btn) =>
				btn
					.setButtonText('Refresh calendar list')
					.onClick(async () => {
						if (!this.plugin.settings.refreshToken) {
							new Notice('Authorize Google Calendar first.');
							return;
						}
						try {
							const fetched = await fetchCalendarList(this.plugin.settings);
							// Preserve existing enabled state, add new calendars as enabled by default
							const existing = new Map(
								this.plugin.settings.calendars.map((c) => [c.id, c.enabled]),
							);
							this.plugin.settings.calendars = fetched.map((c) => ({
								...c,
								enabled: existing.has(c.id) ? (existing.get(c.id) as boolean) : true,
							}));
							await this.plugin.saveSettings();
							this.display();
						} catch (e) {
							new Notice(`Failed to load calendars: ${(e as Error).message}`);
						}
					}),
			);

		if (this.plugin.settings.calendars.length > 0) {
			for (const cal of this.plugin.settings.calendars) {
				new Setting(containerEl)
					.setName(cal.name)
					.setDesc(cal.id)
					.addToggle((toggle) =>
						toggle.setValue(cal.enabled).onChange(async (value) => {
							cal.enabled = value;
							await this.plugin.saveSettings();
						}),
					);
			}
		} else {
			containerEl.createEl('p', {
				text: 'No calendars loaded yet. Click "Refresh calendar list" above.',
				cls: 'setting-item-description',
			});
		}

		// --- Format ---
		containerEl.createEl('h3', { text: 'Format' });

		new Setting(containerEl)
			.setName('Event format')
			.setDesc('Template for each event. Use {time} and {summary} as placeholders.')
			.addText((text) =>
				text
					.setPlaceholder('### {time} — {summary}')
					.setValue(this.plugin.settings.insertFormat)
					.onChange(async (value) => {
						this.plugin.settings.insertFormat = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
