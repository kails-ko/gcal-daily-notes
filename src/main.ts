import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, GCalSettings, GCalSettingTab } from './settings';
import { fetchEventsForDate } from './calendar';

const DAILY_NOTE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default class GCalDailyNotes extends Plugin {
	settings!: GCalSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GCalSettingTab(this.app, this));

		// Wait until Obsidian has finished loading all existing files before
		// listening for 'create', otherwise every file triggers on startup
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on('create', (file) => {
					if (file instanceof TFile) {
						this.insertEventsIntoFile(file);
					}
				}),
			);
		});

		this.addCommand({
			id: 'insert-gcal-events',
			name: 'Insert Google Calendar events for this note',
			callback: () => this.insertEventsAtCursor(),
		});
	}

	onunload() {}

	// Called automatically when a daily note is created
	private async insertEventsIntoFile(file: TFile) {
		const dateStr = this.extractDateFromFilename(file.basename);
		if (!dateStr || !this.settings.refreshToken) return;

		try {
			const events = await fetchEventsForDate(dateStr, this.settings);
			if (events.length === 0) return;

			const block = this.formatBlock(events);
			const content = await this.app.vault.read(file);
			const placeholder = this.settings.placeholder;

			if (placeholder && content.includes(placeholder)) {
				await this.app.vault.modify(file, content.replace(placeholder, block));
			} else {
				await this.app.vault.modify(file, content + block);
			}

			new Notice(`GCal: inserted ${events.length} event(s)`);
		} catch (e) {
			new Notice(`GCal error: ${(e as Error).message}`);
			console.error(e);
		}
	}

	// Called by the manual command — inserts at cursor position
	private async insertEventsAtCursor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('Open a daily note first.');
			return;
		}

		const file = view.file;
		if (!file) return;

		const dateStr = this.extractDateFromFilename(file.basename);
		if (!dateStr) {
			new Notice('This note doesn\'t look like a daily note (expected YYYY-MM-DD).');
			return;
		}

		if (!this.settings.refreshToken) {
			new Notice('Authorize Google Calendar in settings first.');
			return;
		}

		try {
			const events = await fetchEventsForDate(dateStr, this.settings);
			if (events.length === 0) {
				new Notice(`GCal: no events found for ${dateStr}`);
				return;
			}

			const block = this.formatBlock(events);
			view.editor.replaceSelection(block);
			new Notice(`GCal: inserted ${events.length} event(s)`);
		} catch (e) {
			new Notice(`GCal error: ${(e as Error).message}`);
			console.error(e);
		}
	}

	private formatBlock(events: { summary: string; start: string; end: string; url: string }[]): string {
		return events
			.map((e) =>
				this.settings.insertFormat
					.replace('{time}', e.start)
					.replace('{endTime}', e.end)
					.replace('{summary}', e.summary)
					.replace('{url}', e.url),
			)
			.join('\n') + '\n';
	}

	private extractDateFromFilename(basename: string): string | null {
		if (DAILY_NOTE_REGEX.test(basename)) return basename;

		const parsed = new Date(basename);
		if (!isNaN(parsed.getTime())) {
			return parsed.toISOString().slice(0, 10);
		}

		return null;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<GCalSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
