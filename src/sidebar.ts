import { ItemView, WorkspaceLeaf } from 'obsidian';
import { fetchEventsForDate, CalendarEvent } from './calendar';
import { GCalSettings, SidebarView } from './settings';

export const SIDEBAR_VIEW_TYPE = 'gcal-day-view';

// Timeline window: hours to render (6 AM – 10 PM)
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 22;

export class GCalSidebarView extends ItemView {
	private settings: GCalSettings;
	private selectedDate: Date;
	selectedEvent: CalendarEvent | null = null;
	private events: CalendarEvent[] = [];
	private activeView: SidebarView;
	onCreateNote: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, settings: GCalSettings) {
		super(leaf);
		this.settings = settings;
		this.selectedDate = new Date();
		this.selectedDate.setHours(0, 0, 0, 0);
		this.activeView = settings.defaultSidebarView ?? 'list';
	}

	getViewType(): string { return SIDEBAR_VIEW_TYPE; }
	getDisplayText(): string { return 'GCal Day View'; }
	getIcon(): string { return 'calendar-days'; }

	updateSettings(settings: GCalSettings) {
		this.settings = settings;
	}

	async onOpen() { await this.renderView(); }
	onClose(): Promise<void> { return Promise.resolve(); }

	private dateString(): string {
		return this.selectedDate.toISOString().slice(0, 10);
	}

	private formatHeaderDate(): string {
		return this.selectedDate.toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
		});
	}

	private isToday(): boolean {
		const today = new Date();
		return (
			this.selectedDate.getFullYear() === today.getFullYear() &&
			this.selectedDate.getMonth() === today.getMonth() &&
			this.selectedDate.getDate() === today.getDate()
		);
	}

	private shiftDay(delta: number) {
		this.selectedDate = new Date(this.selectedDate);
		this.selectedDate.setDate(this.selectedDate.getDate() + delta);
		this.selectedEvent = null;
		void this.renderView();
	}

	async renderView() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('gcal-sidebar');

		// ── Header ──────────────────────────────────────────────────────────
		const header = container.createDiv('gcal-sidebar-header');

		const prevBtn = header.createEl('button', { cls: 'gcal-nav-btn', text: '‹' });
		prevBtn.setAttribute('aria-label', 'Previous day');
		prevBtn.addEventListener('click', () => this.shiftDay(-1));

		const centerCol = header.createDiv('gcal-header-center');

		const dateLabel = centerCol.createEl('span', {
			cls: 'gcal-date-label',
			text: this.formatHeaderDate(),
		});

		const datePicker = centerCol.createEl('input', { cls: 'gcal-date-picker', type: 'date' });
		datePicker.value = this.dateString();
		dateLabel.addEventListener('click', () => datePicker.showPicker?.() ?? datePicker.click());
		datePicker.addEventListener('change', () => {
			if (!datePicker.value) return;
			this.selectedDate = new Date(`${datePicker.value}T00:00:00`);
			this.selectedEvent = null;
			void this.renderView();
		});

		if (!this.isToday()) {
			const todayBtn = centerCol.createEl('button', { cls: 'gcal-today-btn', text: 'Today' });
			todayBtn.addEventListener('click', () => {
				this.selectedDate = new Date();
				this.selectedDate.setHours(0, 0, 0, 0);
				this.selectedEvent = null;
				void this.renderView();
			});
		}

		const nextBtn = header.createEl('button', { cls: 'gcal-nav-btn', text: '›' });
		nextBtn.setAttribute('aria-label', 'Next day');
		nextBtn.addEventListener('click', () => this.shiftDay(1));

		// View toggle
		const viewToggle = header.createDiv('gcal-view-toggle');

		const listBtn = viewToggle.createEl('button', {
			cls: 'gcal-view-btn' + (this.activeView === 'list' ? ' is-active' : ''),
			attr: { 'aria-label': 'List view' },
		});
		listBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

		const timelineBtn = viewToggle.createEl('button', {
			cls: 'gcal-view-btn' + (this.activeView === 'timeline' ? ' is-active' : ''),
			attr: { 'aria-label': 'Timeline view' },
		});
		timelineBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="11" width="11" height="4" rx="1"/><rect x="3" y="18" width="15" height="4" rx="1"/></svg>`;

		listBtn.addEventListener('click', () => {
			this.activeView = 'list';
			void this.renderView();
		});
		timelineBtn.addEventListener('click', () => {
			this.activeView = 'timeline';
			void this.renderView();
		});

		// ── Body ────────────────────────────────────────────────────────────
		const body = container.createDiv('gcal-sidebar-body');

		if (!this.settings.refreshToken) {
			body.createEl('p', {
				cls: 'gcal-empty',
				text: 'Authorize Google Calendar in plugin settings first.',
			});
			return;
		}

		const loadingEl = body.createEl('p', { cls: 'gcal-loading', text: 'Loading events…' });

		try {
			this.events = await fetchEventsForDate(this.dateString(), this.settings);
		} catch (e) {
			loadingEl.remove();
			body.createEl('p', { cls: 'gcal-empty', text: `Error: ${(e as Error).message}` });
			return;
		}

		loadingEl.remove();

		if (this.events.length === 0) {
			body.createEl('p', { cls: 'gcal-empty', text: 'No events today.' });
			return;
		}

		const allDay = this.events.filter((e) => e.start === 'All day');
		const timed = this.events.filter((e) => e.start !== 'All day');

		// All-day chips (shown in both views)
		if (allDay.length > 0) {
			const chipRow = body.createDiv('gcal-allday-row');
			chipRow.createEl('span', { cls: 'gcal-allday-label', text: 'All day' });
			for (const ev of allDay) {
				const chip = chipRow.createEl('span', { cls: 'gcal-allday-chip', text: ev.summary });
				if (ev.calendarColor) chip.style.backgroundColor = ev.calendarColor;
				chip.addEventListener('click', () => this.selectEvent(ev, chip, body));
				chip.addEventListener('dblclick', () => {
					this.selectEvent(ev, chip, body);
					this.onCreateNote?.();
				});
				if (this.selectedEvent === ev) chip.addClass('is-selected');
			}
		}

		if (this.activeView === 'timeline') {
			this.renderTimeline(body, timed);
		} else {
			this.renderList(body, timed);
		}

		// Detail bar — shown when an event is selected
		this.renderDetailBar(container);
	}

	private renderDetailBar(container: HTMLElement) {
		const existing = container.querySelector('.gcal-detail-bar');
		if (existing) existing.remove();
		if (!this.selectedEvent) return;

		const ev = this.selectedEvent;
		const bar = container.createDiv('gcal-detail-bar');

		const timeStr = ev.end ? `${ev.start} – ${ev.end}` : ev.start;
		bar.createEl('span', { cls: 'gcal-detail-time', text: timeStr });
		bar.createEl('span', { cls: 'gcal-detail-title', text: ev.summary });
	}

	// ── List view ────────────────────────────────────────────────────────────

	private renderList(body: HTMLElement, timed: CalendarEvent[]) {
		const list = body.createDiv('gcal-event-list');
		for (const ev of timed) {
			const row = list.createDiv('gcal-event-row');
			if (this.selectedEvent === ev) row.addClass('is-selected');
			if (ev.calendarColor) {
				row.style.borderLeftColor = ev.calendarColor;
				row.addClass('gcal-event-row--colored');
			}

			const timePill = row.createDiv('gcal-event-time');
			timePill.createEl('span', { cls: 'gcal-time-start', text: ev.start });
			if (ev.end) timePill.createEl('span', { cls: 'gcal-time-end', text: ev.end });

			const titleWrap = row.createDiv('gcal-event-title-wrap');
			titleWrap.createEl('span', { cls: 'gcal-event-title', text: ev.summary });
			this.appendLinkedBadge(titleWrap, ev);

			row.addEventListener('click', () => this.selectEvent(ev, row, body));
			row.addEventListener('dblclick', () => {
				this.selectEvent(ev, row, body);
				this.onCreateNote?.();
			});
		}
	}

	// ── Timeline view ────────────────────────────────────────────────────────

	private renderTimeline(body: HTMLElement, timed: CalendarEvent[]) {
		const PX_PER_HOUR = this.settings.timelineHourHeight ?? 60;
		const totalHours = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
		const totalHeight = totalHours * PX_PER_HOUR;

		const wrapper = body.createDiv('gcal-timeline-wrapper');
		const grid = wrapper.createDiv('gcal-timeline-grid');
		grid.style.height = `${totalHeight}px`;

		// Hour labels + gridlines
		for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) {
			const y = (h - TIMELINE_START_HOUR) * PX_PER_HOUR;

			const label = grid.createDiv('gcal-timeline-hour-label');
			label.style.top = `${y}px`;
			label.setText(this.formatHour(h));

			const line = grid.createDiv('gcal-timeline-gridline');
			line.style.top = `${y}px`;
		}

		// Now-indicator
		if (this.isToday()) {
			const now = new Date();
			const nowHour = now.getHours() + now.getMinutes() / 60;
			if (nowHour >= TIMELINE_START_HOUR && nowHour <= TIMELINE_END_HOUR) {
				const nowY = (nowHour - TIMELINE_START_HOUR) * PX_PER_HOUR;
				const nowLine = grid.createDiv('gcal-timeline-now');
				nowLine.style.top = `${nowY}px`;
			}
		}

		// Event blocks
		const eventsArea = grid.createDiv('gcal-timeline-events');

		for (const ev of timed) {
			const startMins = this.parseTimeToMinutes(ev.startRaw);
			const endMins = ev.end ? this.parseTimeToMinutes(this.parseEndTime(ev)) : startMins + 60;

			const startHour = startMins / 60;
			const endHour = endMins / 60;

			const clampedStart = Math.max(startHour, TIMELINE_START_HOUR);
			const clampedEnd = Math.min(endHour, TIMELINE_END_HOUR);
			if (clampedStart >= clampedEnd) continue;

			const top = (clampedStart - TIMELINE_START_HOUR) * PX_PER_HOUR;
			const height = Math.max((clampedEnd - clampedStart) * PX_PER_HOUR, 24);

			const block = eventsArea.createDiv('gcal-timeline-event');
			block.style.top = `${top}px`;
			block.style.height = `${height}px`;

			if (ev.calendarColor) {
				block.style.borderLeftColor = ev.calendarColor;
				block.style.backgroundColor = ev.calendarColor + '22'; // ~14% opacity
			}

			if (this.selectedEvent === ev) block.addClass('is-selected');

			const timeSpan = block.createEl('span', { cls: 'gcal-tl-time', text: ev.start });
			const titleSpan = block.createEl('span', { cls: 'gcal-tl-title', text: ev.summary });
			this.appendLinkedBadge(block, ev);

			block.addEventListener('click', () => this.selectEvent(ev, block, body));
			block.addEventListener('dblclick', () => {
				this.selectEvent(ev, block, body);
				this.onCreateNote?.();
			});
		}

		// Scroll to show the first event (or current time) on open
		const scrollToHour = this.isToday()
			? Math.max(new Date().getHours() - 1, TIMELINE_START_HOUR)
			: (timed[0] ? Math.max(timed[0].startRaw.getHours() - 1, TIMELINE_START_HOUR) : TIMELINE_START_HOUR);
		wrapper.scrollTop = (scrollToHour - TIMELINE_START_HOUR) * PX_PER_HOUR;
	}

	private formatHour(h: number): string {
		const ampm = h < 12 ? 'AM' : 'PM';
		const display = h % 12 === 0 ? 12 : h % 12;
		return `${display} ${ampm}`;
	}

	private parseTimeToMinutes(date: Date): number {
		return date.getHours() * 60 + date.getMinutes();
	}

	// Reconstruct end time Date from ev.end string and ev.startRaw date
	private parseEndTime(ev: CalendarEvent): Date {
		if (!ev.end) return ev.startRaw;
		// ev.end is a formatted string like "2:30 PM"; use startRaw's date as anchor
		const base = new Date(ev.startRaw);
		const match = ev.end.match(/(\d+):(\d+)\s*(AM|PM)/i);
		if (!match) return ev.startRaw;
		let hours = parseInt(match[1] ?? '0');
		const mins = parseInt(match[2] ?? '0');
		const ampm = (match[3] ?? 'AM').toUpperCase();
		if (ampm === 'PM' && hours !== 12) hours += 12;
		if (ampm === 'AM' && hours === 12) hours = 0;
		base.setHours(hours, mins, 0, 0);
		return base;
	}

	// ── Shared helpers ───────────────────────────────────────────────────────

	private appendLinkedBadge(parent: HTMLElement, ev: CalendarEvent) {
		const linkedFile = this.findLinkedNote(ev);
		if (!linkedFile) return;
		const badge = parent.createEl('span', { cls: 'gcal-linked-badge', text: '[[]]' });
		badge.setAttribute('aria-label', 'Open linked note');
		badge.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.app.workspace.getLeaf(false).openFile(linkedFile);
		});
	}

	private selectEvent(ev: CalendarEvent, el: HTMLElement, body: HTMLElement) {
		body.querySelectorAll('.is-selected').forEach((n) => n.removeClass('is-selected'));
		if (this.selectedEvent === ev) {
			this.selectedEvent = null;
		} else {
			this.selectedEvent = ev;
			el.addClass('is-selected');
		}
		const container = this.containerEl.children[1] as HTMLElement;
		this.renderDetailBar(container);
	}

	getLinkedNotePath(ev: CalendarEvent): string {
		const folder = this.settings.eventNoteFolder.replace(/\/$/, '');
		const safeName = ev.summary.replace(/[\\/:*?"<>|]/g, '-');
		return `${folder}/${this.dateString()} ${safeName}.md`;
	}

	findLinkedNote(ev: CalendarEvent): import('obsidian').TFile | null {
		const folder = this.settings.eventNoteFolder.replace(/\/$/, '');
		const safeName = ev.summary.replace(/[\\/:*?"<>|]/g, '-');
		const prefix = `${this.dateString()} ${safeName}`;
		const folderFiles = this.app.vault.getFiles().filter(
			(f) => f.path.startsWith(folder + '/') && f.basename.startsWith(prefix),
		);
		return folderFiles[0] ?? null;
	}

	getSelectedDate(): Date { return this.selectedDate; }
}
