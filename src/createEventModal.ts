import { App, Modal, Setting } from 'obsidian';
import { CalendarEntry } from './settings';

export interface CreateEventOptions {
	title: string;
	date: string;
	startTime: string;
	endTime: string;
	location: string;
	calendarId: string;
	linkToCurrentNote: boolean;
	createNote: boolean;
}

function roundUpTo15(date: Date): string {
	const m = date.getMinutes();
	const rounded = Math.ceil((m + 1) / 15) * 15;
	const d = new Date(date);
	d.setSeconds(0, 0);
	if (rounded >= 60) {
		d.setHours(d.getHours() + 1);
		d.setMinutes(0);
	} else {
		d.setMinutes(rounded);
	}
	return d.toTimeString().slice(0, 5);
}

function addHour(time: string): string {
	const parts = time.split(':').map(Number);
	const h = parts[0] ?? 0;
	const m = parts[1] ?? 0;
	return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class CreateEventModal extends Modal {
	private calendars: CalendarEntry[];
	private onSubmit: (opts: CreateEventOptions) => Promise<void>;

	private title = '';
	private date: string;
	private startTime: string;
	private endTime: string;
	private location = '';
	private calendarId: string;
	private linkToCurrentNote = false;
	private createNote = false;

	constructor(
		app: App,
		calendars: CalendarEntry[],
		onSubmit: (opts: CreateEventOptions) => Promise<void>,
	) {
		super(app);
		this.calendars = calendars.filter((c) => c.enabled);
		this.onSubmit = onSubmit;

		const now = new Date();
		this.date = now.toISOString().slice(0, 10);
		this.startTime = roundUpTo15(now);
		this.endTime = addHour(this.startTime);
		this.calendarId = this.calendars[0]?.id ?? '';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Create Google Calendar event', cls: 'gcal-modal-heading' });

		new Setting(contentEl)
			.setName('Title')
			.addText((text) => {
				text.setPlaceholder('Event title').onChange((v) => { this.title = v; });
				setTimeout(() => text.inputEl.focus(), 0);
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') { e.preventDefault(); void this.submit(); }
				});
			});

		new Setting(contentEl)
			.setName('Date')
			.addText((text) => {
				text.inputEl.type = 'date';
				text.setValue(this.date).onChange((v) => { this.date = v; });
			});

		new Setting(contentEl)
			.setName('Start time')
			.addText((text) => {
				text.inputEl.type = 'time';
				text.setValue(this.startTime).onChange((v) => { this.startTime = v; });
			});

		new Setting(contentEl)
			.setName('End time')
			.addText((text) => {
				text.inputEl.type = 'time';
				text.setValue(this.endTime).onChange((v) => { this.endTime = v; });
			});

		new Setting(contentEl)
			.setName('Location')
			.setDesc('Optional')
			.addText((text) => {
				text.setPlaceholder('e.g. 123 Main St or Zoom').onChange((v) => { this.location = v; });
			});

		if (this.calendars.length > 1) {
			new Setting(contentEl)
				.setName('Calendar')
				.addDropdown((drop) => {
					for (const cal of this.calendars) drop.addOption(cal.id, cal.name);
					drop.setValue(this.calendarId).onChange((v) => { this.calendarId = v; });
				});
		}

		new Setting(contentEl)
			.setName('Link to current note')
			.setDesc('Insert a [[wikilink]] to the event note at your cursor')
			.addToggle((toggle) => toggle.setValue(false).onChange((v) => { this.linkToCurrentNote = v; }));

		new Setting(contentEl)
			.setName('Create note for this event')
			.setDesc('Create an Obsidian note using your event note template')
			.addToggle((toggle) => toggle.setValue(false).onChange((v) => { this.createNote = v; }));

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText('Create event').setCta().onClick(() => void this.submit()))
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	private async submit() {
		if (!this.title.trim() || !this.calendarId) return;
		this.close();
		await this.onSubmit({
			title: this.title.trim(),
			date: this.date,
			startTime: this.startTime,
			endTime: this.endTime,
			location: this.location.trim(),
			calendarId: this.calendarId,
			linkToCurrentNote: this.linkToCurrentNote,
			createNote: this.createNote,
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
