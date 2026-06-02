import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, GCalSettings, GCalSettingTab } from './settings';
import { fetchEventsForDate, createCalendarEvent } from './calendar';
import { GCalSidebarView, SIDEBAR_VIEW_TYPE } from './sidebar';
import { EventNoteModal } from './eventNoteModal';
import { CreateEventModal } from './createEventModal';

const DAILY_NOTE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default class GCalDailyNotes extends Plugin {
	settings!: GCalSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GCalSettingTab(this.app, this));

		// Register sidebar view
		this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => {
			const view = new GCalSidebarView(leaf, this.settings);
			view.onCreateNote = () => void this.createEventNote();
			return view;
		});

		// Ribbon icon to open sidebar
		this.addRibbonIcon('calendar-days', 'GCal Day View', () => {
			void this.activateSidebar();
		});

		// Wait until layout is ready before listening for file creates
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

		this.addCommand({
			id: 'open-gcal-sidebar',
			name: 'Open GCal Day View sidebar',
			callback: () => void this.activateSidebar(),
		});

		this.addCommand({
			id: 'create-event-note',
			name: 'Create event note for selected event',
			callback: () => void this.createEventNote(),
		});

		this.addCommand({
			id: 'create-gcal-event',
			name: 'Create Google Calendar event',
			callback: () => void this.createGCalEvent(),
		});
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
	}

	// ── Sidebar ────────────────────────────────────────────────────────────────

	async activateSidebar() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(false);
			await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
		// Wire double-click callback after the view is ready
		const view = leaf.view;
		if (view instanceof GCalSidebarView) {
			view.onCreateNote = () => void this.createEventNote();
		}
	}

	getSidebarView(): GCalSidebarView | null {
		const leaf = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
		if (leaf && leaf.view instanceof GCalSidebarView) {
			const view = leaf.view;
			if (!view.onCreateNote) view.onCreateNote = () => void this.createEventNote();
			return view;
		}
		return null;
	}

	// ── Create event note ──────────────────────────────────────────────────────

	private async createEventNote() {
		const sidebar = this.getSidebarView();
		if (!sidebar) {
			new Notice('Open the GCal Day View sidebar first.');
			return;
		}

		const ev = sidebar.selectedEvent;
		if (!ev) {
			new Notice('Click an event in the sidebar to select it first.');
			return;
		}

		// Build default title: "YYYY-MM-DD — Event Name"
		const date = sidebar.getSelectedDate().toISOString().slice(0, 10);
		const safeName = ev.summary.replace(/[\\/:*?"<>|]/g, '-');
		const defaultTitle = `${date} ${safeName}`;

		const sourceView = this.getMarkdownView();
		const sourceFile = sourceView?.file ?? null;
		const sourceCursor = sourceView?.editor.getCursor() ?? null;

		new EventNoteModal(this.app, defaultTitle, async (chosenTitle, linkToCurrentNote) => {
			const folder = this.settings.eventNoteFolder.replace(/\/$/, '');
			const notePath = `${folder}/${chosenTitle}.md`;

			// If the note already exists, just open it
			const existing = this.app.vault.getFileByPath(notePath);
			if (existing) {
				await this.app.workspace.getLeaf(false).openFile(existing);
				return;
			}

			// Build note content from template or bare
			let content = '';
			if (this.settings.eventNoteTemplate) {
				const templateFile = this.app.vault.getFileByPath(this.settings.eventNoteTemplate);
				if (!templateFile) {
					new Notice(`Template not found: ${this.settings.eventNoteTemplate}`);
					return;
				}
				const raw = await this.app.vault.read(templateFile);
				content = raw
					.replace(/\{\{summary\}\}/g, ev.summary)
					.replace(/\{\{title\}\}/g, ev.summary)
					.replace(/\{\{date\}\}/g, date)
					.replace(/\{\{time\}\}/g, ev.start)
					.replace(/\{\{icsEventStart\}\}/g, ev.start)
					.replace(/\{\{endTime\}\}/g, ev.end)
					.replace(/\{\{icsEventEnd\}\}/g, ev.end)
					.replace(/\{\{url\}\}/g, ev.url)
					.replace(/\{\{icsEventUrl\}\}/g, ev.url);
			}

			try {
				if (linkToCurrentNote && sourceFile && sourceCursor) {
					const raw = await this.app.vault.read(sourceFile);
					const lines = raw.split('\n');
					const line = lines[sourceCursor.line] ?? '';
					lines[sourceCursor.line] = line.slice(0, sourceCursor.ch) + `[[${chosenTitle}]]` + line.slice(sourceCursor.ch);
					await this.app.vault.modify(sourceFile, lines.join('\n'));
				} else if (linkToCurrentNote) {
					new Notice('No active note to link into.');
				}
				const newFile = await this.app.vault.create(notePath, content);
				await this.app.workspace.getLeaf(false).openFile(newFile);
				await sidebar.renderView();
				new Notice(`Created: ${newFile.basename}`);
			} catch (e) {
				new Notice(`Failed to create note: ${(e as Error).message}`);
			}
		}).open();
	}

	// ── Create GCal event ─────────────────────────────────────────────────────

	private async createGCalEvent() {
		if (!this.settings.refreshToken) {
			new Notice('Authorize Google Calendar in settings first.');
			return;
		}

		const enabledCals = this.settings.calendars.filter((c) => c.enabled);
		if (enabledCals.length === 0) {
			new Notice('No calendars configured. Refresh your calendar list in settings.');
			return;
		}

		const sourceView = this.getMarkdownView();
		const sourceFile = sourceView?.file ?? null;
		const sourceCursor = sourceView?.editor.getCursor() ?? null;

		new CreateEventModal(this.app, this.settings.calendars, async (opts) => {
			try {
				const eventUrl = await createCalendarEvent(
					opts.calendarId,
					{
						summary: opts.title,
						date: opts.date,
						startTime: opts.startTime,
						endTime: opts.endTime,
						location: opts.location || undefined,
						timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					},
					this.settings,
				);

				new Notice(`Event created: ${opts.title}`);

				const safeName = opts.title.replace(/[\\/:*?"<>|]/g, '-');
				const noteTitle = `${opts.date} ${safeName}`;
				const folder = this.settings.eventNoteFolder.replace(/\/$/, '');
				const notePath = `${folder}/${noteTitle}.md`;

				if (opts.linkToCurrentNote && sourceFile && sourceCursor) {
					const raw = await this.app.vault.read(sourceFile);
					const lines = raw.split('\n');
					const line = lines[sourceCursor.line] ?? '';
					lines[sourceCursor.line] = line.slice(0, sourceCursor.ch) + `[[${noteTitle}]]` + line.slice(sourceCursor.ch);
					await this.app.vault.modify(sourceFile, lines.join('\n'));
				} else if (opts.linkToCurrentNote) {
					new Notice('No active note open to link into.');
				}

				if (opts.createNote) {
					const existing = this.app.vault.getFileByPath(notePath);
					if (existing) {
						await this.app.workspace.getLeaf(false).openFile(existing);
					} else {
						let content = '';
						if (this.settings.eventNoteTemplate) {
							const templateFile = this.app.vault.getFileByPath(this.settings.eventNoteTemplate);
							if (templateFile) {
								const raw = await this.app.vault.read(templateFile);
								content = raw
									.replace(/\{\{summary\}\}/g, opts.title)
									.replace(/\{\{title\}\}/g, opts.title)
									.replace(/\{\{date\}\}/g, opts.date)
									.replace(/\{\{time\}\}/g, opts.startTime)
									.replace(/\{\{icsEventStart\}\}/g, opts.startTime)
									.replace(/\{\{endTime\}\}/g, opts.endTime)
									.replace(/\{\{icsEventEnd\}\}/g, opts.endTime)
									.replace(/\{\{url\}\}/g, eventUrl)
									.replace(/\{\{icsEventUrl\}\}/g, eventUrl)
									.replace(/\{\{location\}\}/g, opts.location);
							}
						}
						const newFile = await this.app.vault.create(notePath, content);
						await this.app.workspace.getLeaf(false).openFile(newFile);
						new Notice(`Note created: ${noteTitle}`);
					}
				}
			} catch (e) {
				new Notice(`Failed to create event: ${(e as Error).message}`);
			}
		}).open();
	}

	// ── Daily note auto-insert ─────────────────────────────────────────────────

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

	// ── Helpers ───────────────────────────────────────────────────────────────

	/** Returns the active MarkdownView, or falls back to the most recently
	 *  modified markdown leaf if nothing is focused (e.g. command palette open). */
	private getMarkdownView(): MarkdownView | null {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (active) return active;

		let found: MarkdownView | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!found && leaf.view instanceof MarkdownView) {
				found = leaf.view;
			}
		});
		return found;
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
		// Push updated settings into the live sidebar view if open
		this.getSidebarView()?.updateSettings(this.settings);
	}
}
