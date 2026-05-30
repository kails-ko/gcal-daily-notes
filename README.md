# GCal Daily Notes

An [Obsidian](https://obsidian.md) plugin that automatically fetches your Google Calendar events into daily notes.

## Features

- Inserts events when a daily note is created
- Manual command to insert events at your cursor position
- Fetches from all your Google Calendars with per-calendar on/off toggles
- Fully customizable event format using `{time}`, `{endTime}`, `{summary}`, and `{url}` placeholders

## Example output

With the default format `[{time}-{endTime} {summary}]({url})`, events insert as clickable links:

```
[9:00 AM-10:00 AM Team standup](https://calendar.google.com/...)
[1:00 PM-2:00 PM Design review](https://calendar.google.com/...)
```

## Setup

### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a new project
2. Go to **APIs & Services → Library**, search for **Google Calendar API**, and enable it
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Set the application type to **Desktop App**
5. Under **Authorized redirect URIs**, add `http://localhost:42813/callback`
6. Copy your **Client ID** and **Client Secret**

### 2. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Set User Type to **External**
3. Fill in the required fields (app name, support email)
4. Under **Test users**, add your Google account email

### 3. Install the plugin

Copy `main.js`, `manifest.json`, and `styles.css` into your vault at:

```
<vault>/.obsidian/plugins/gcal-daily-notes/
```

Then enable it in **Settings → Community Plugins**.

### 4. Authorize

1. Open **Settings → GCal Daily Notes**
2. Enter your Client ID and Client Secret
3. Click **Authorize** — a browser window will open to Google's consent screen
4. After approving, the plugin stores your refresh token automatically

### 5. Load your calendars

1. Click **Refresh calendar list** in settings
2. Toggle off any calendars you don't want included (e.g. Birthdays, Holidays)

## Usage

**Automatic:** Create a note named with today's date (e.g. `2026-05-29.md`) and events are inserted automatically.

**Manual:** Open any daily note, place your cursor where you want the events, and run:

```
Cmd+P → Insert Google Calendar events for this note
```

## Format placeholders

| Placeholder | Description | Example |
|---|---|---|
| `{time}` | Event start time | `9:00 AM` |
| `{endTime}` | Event end time | `10:00 AM` |
| `{summary}` | Event title | `Team standup` |
| `{url}` | Link to the event in Google Calendar | `https://...` |

The format can be any markdown string, for example:

```
**{time}–{endTime}** {summary}
```

```
[{time}-{endTime} {summary}]({url})
```

## Daily note filename formats

The plugin recognizes filenames in `YYYY-MM-DD` format (e.g. `2026-05-29.md`), which is the default used by the Obsidian Daily Notes core plugin.

## Development

```bash
git clone https://github.com/kails-ko/gcal-daily-notes
cd gcal-daily-notes
npm install
npm run dev
```

Copy the folder into your vault's `.obsidian/plugins/` directory and enable it in Obsidian.
