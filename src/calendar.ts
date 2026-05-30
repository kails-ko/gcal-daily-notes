import { getAccessToken } from './auth';
import { CalendarEntry, GCalSettings } from './settings';

export interface CalendarEvent {
	summary: string;
	start: string;
	end: string;
	url: string;
	startRaw: Date;
}

export async function fetchCalendarList(settings: GCalSettings): Promise<CalendarEntry[]> {
	const accessToken = await getAccessToken(settings);
	const response = await fetch(
		'https://www.googleapis.com/calendar/v3/users/me/calendarList',
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);
	const data = await response.json() as { items?: { id: string; summary: string }[]; error?: { message: string } };
	if (!response.ok) throw new Error(data.error?.message ?? 'Failed to fetch calendar list');
	return (data.items ?? []).map((c) => ({ id: c.id, name: c.summary, enabled: true }));
}

export async function fetchEventsForDate(
	date: string,
	settings: GCalSettings,
): Promise<CalendarEvent[]> {
	const accessToken = await getAccessToken(settings);

	const dayStart = new Date(`${date}T00:00:00`).toISOString();
	const dayEnd = new Date(`${date}T23:59:59`).toISOString();

	// Use enabled calendars from settings, or fall back to fetching all
	let calendarIds: string[];
	if (settings.calendars.length > 0) {
		calendarIds = settings.calendars.filter((c) => c.enabled).map((c) => c.id);
	} else {
		const all = await fetchCalendarList(settings);
		calendarIds = all.map((c) => c.id);
	}

	const allEvents: CalendarEvent[] = [];

	await Promise.all(
		calendarIds.map(async (calId) => {
			const params = new URLSearchParams({
				timeMin: dayStart,
				timeMax: dayEnd,
				singleEvents: 'true',
				orderBy: 'startTime',
			});

			const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`;
			const response = await fetch(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});

			const data = await response.json() as { items?: GoogleCalendarEvent[]; error?: { message: string } };
			if (!response.ok) {
				console.warn(`GCal: skipping calendar ${calId}: ${data.error?.message}`);
				return;
			}

			for (const event of data.items ?? []) {
				allEvents.push(formatEvent(event));
			}
		}),
	);

	allEvents.sort((a, b) => a.startRaw.getTime() - b.startRaw.getTime());
	return allEvents;
}

interface GoogleCalendarEvent {
	summary?: string;
	htmlLink?: string;
	start?: { dateTime?: string; date?: string };
	end?: { dateTime?: string; date?: string };
}

function formatTime(dateTime: string): string {
	return new Date(dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatEvent(event: GoogleCalendarEvent): CalendarEvent {
	const summary = event.summary ?? '(No title)';
	const url = event.htmlLink ?? '';
	const dateTimeRaw = event.start?.dateTime;
	const dateRaw = event.start?.date;

	if (dateTimeRaw) {
		const startDate = new Date(dateTimeRaw);
		const endRaw = event.end?.dateTime;
		return {
			summary,
			url,
			start: formatTime(dateTimeRaw),
			end: endRaw ? formatTime(endRaw) : '',
			startRaw: startDate,
		};
	}

	return {
		summary,
		url,
		start: 'All day',
		end: '',
		startRaw: new Date(`${dateRaw}T00:00:00`),
	};
}
