import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import GCalDailyNotes from './main';
import { startOAuthFlow } from './auth';
import { fetchCalendarList } from './calendar';

export interface CalendarEntry {
	id: string;
	name: string;
	enabled: boolean;
	color: string;
}

export type SidebarView = 'list' | 'timeline';

export interface GCalSettings {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	calendars: CalendarEntry[];
	insertFormat: string;
	placeholder: string;
	eventNoteFolder: string;
	eventNoteTemplate: string;
	defaultSidebarView: SidebarView;
}

export const DEFAULT_SETTINGS: GCalSettings = {
	clientId: '',
	clientSecret: '',
	refreshToken: '',
	calendars: [],
	insertFormat: '### {time} — {summary}',
	placeholder: '{{gcal}}',
	eventNoteFolder: '_tofile',
	eventNoteTemplate: '',
	defaultSidebarView: 'list',
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

		// ── 1. Authentication ─────────────────────────────────────────────────

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

		// ── 2. Event Notes ────────────────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Event Notes' });

		new Setting(containerEl)
			.setName('Event note folder')
			.setDesc('Folder where new event notes are created (must already exist in your vault).')
			.addText((text) =>
				text
					.setPlaceholder('_tofile')
					.setValue(this.plugin.settings.eventNoteFolder)
					.onChange(async (value) => {
						this.plugin.settings.eventNoteFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Event note template')
			.setDesc(
				'Path to a template file in your vault (e.g. _templates/_meeting note.md). ' +
				'Supports {{summary}}, {{date}}, {{time}}, {{endTime}}, and {{url}} tokens.',
			)
			.addText((text) =>
				text
					.setPlaceholder('_templates/_meeting note.md')
					.setValue(this.plugin.settings.eventNoteTemplate)
					.onChange(async (value) => {
						this.plugin.settings.eventNoteTemplate = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		// ── 3. Format ─────────────────────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Format' });

		new Setting(containerEl)
			.setName('Default sidebar view')
			.setDesc('Which view to show when opening the GCal sidebar.')
			.addDropdown((drop) =>
				drop
					.addOption('list', 'Day list')
					.addOption('timeline', 'Timeline')
					.setValue(this.plugin.settings.defaultSidebarView)
					.onChange(async (value) => {
						this.plugin.settings.defaultSidebarView = value as SidebarView;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Template placeholder')
			.setDesc('Text in your daily note template where events are inserted. If not found, events are appended to the end.')
			.addText((text) =>
				text
					.setPlaceholder('{{gcal}}')
					.setValue(this.plugin.settings.placeholder)
					.onChange(async (value) => {
						this.plugin.settings.placeholder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Event format')
			.setDesc('Template for each event line. Use {time}, {endTime}, {summary}, and {url}.')
			.addText((text) =>
				text
					.setPlaceholder('[{time}-{endTime} {summary}]({url})')
					.setValue(this.plugin.settings.insertFormat)
					.onChange(async (value) => {
						this.plugin.settings.insertFormat = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── 4. Calendars ──────────────────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Calendars' });

		new Setting(containerEl)
			.setName('Refresh calendar list')
			.setDesc('Fetch your calendars from Google to enable/disable them and set colors.')
			.addButton((btn) =>
				btn
					.setButtonText('Refresh')
					.onClick(async () => {
						if (!this.plugin.settings.refreshToken) {
							new Notice('Authorize Google Calendar first.');
							return;
						}
						try {
							const fetched = await fetchCalendarList(this.plugin.settings);
							const existingEntries = new Map(
								this.plugin.settings.calendars.map((c) => [c.id, c]),
							);
							this.plugin.settings.calendars = fetched.map((c) => {
								const existing = existingEntries.get(c.id);
								return {
									...c,
									enabled: existing ? existing.enabled : true,
									// Prefer user-overridden color; fall back to Google's color
									color: existing?.color ?? c.color,
								};
							});
							await this.plugin.saveSettings();
							this.display();
						} catch (e) {
							new Notice(`Failed to load calendars: ${(e as Error).message}`);
						}
					}),
			);

		if (this.plugin.settings.calendars.length > 0) {
			for (const cal of this.plugin.settings.calendars) {
				const setting = new Setting(containerEl)
					.setName(cal.name)
					.setDesc(cal.id)
					.addToggle((toggle) =>
						toggle.setValue(cal.enabled).onChange(async (value) => {
							cal.enabled = value;
							await this.plugin.saveSettings();
						}),
					);

				// Color swatch + hex input
				const colorWrap = setting.controlEl.createDiv('gcal-color-wrap');

				const colorPicker = colorWrap.createEl('input', { cls: 'gcal-color-picker' });
				colorPicker.type = 'color';
				colorPicker.value = cal.color || '#4a90e2';

				const hexInput = colorWrap.createEl('input', { cls: 'gcal-hex-input' });
				hexInput.type = 'text';
				hexInput.value = cal.color || '';
				hexInput.placeholder = '#rrggbb';
				hexInput.maxLength = 7;

				const syncColor = async (hex: string) => {
					cal.color = hex;
					colorPicker.value = hex;
					hexInput.value = hex;
					await this.plugin.saveSettings();
				};

				colorPicker.addEventListener('input', () => void syncColor(colorPicker.value));
				hexInput.addEventListener('change', () => {
					const val = hexInput.value.trim();
					if (/^#[0-9a-fA-F]{6}$/.test(val)) void syncColor(val);
				});
			}
		} else {
			containerEl.createEl('p', {
				text: 'No calendars loaded yet. Click "Refresh" above.',
				cls: 'setting-item-description',
			});
		}
	}
}
