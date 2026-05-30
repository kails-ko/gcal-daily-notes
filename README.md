# GCal Daily Notes

An [Obsidian](https://obsidian.md) plugin that integrates Google Calendar into your vault — inserting events into daily notes and providing a sidebar day/timeline view with event note creation.

---

> [!WARNING]
> **This plugin is entirely vibe-coded and has not been reviewed or vetted by Obsidian.** It is not listed in the Community Plugins directory. Use at your own risk, and always back up your vault.

---

## Features

- **Sidebar day view** — browse your calendar day by day in a clean list or timeline view
- **Timeline view** — scrollable hourly grid with a live now-indicator and proportionally sized event blocks
- **Color-coded calendars** — events are tinted by calendar color; customize colors via a color picker in settings
- **Event note creation** — double-click any event (or use the command palette) to create a linked note from a template, with a customizable title
- **Linked note badge** — events with an associated note show a `[[]]` badge; click it to open the note
- **Auto-insert on daily note creation** — events are inserted automatically when a `YYYY-MM-DD` note is created
- **Manual insert command** — insert events at your cursor in any daily note
- **Per-calendar toggles** — enable or disable individual calendars from settings

## Sidebar

Open the sidebar by clicking the calendar icon in the ribbon, or via:

```
Cmd+P → GCal: Open GCal Day View sidebar
```

### Navigation
- Click **‹ ›** to move between days
- Click the **date label** to open a date picker
- Click **Today** to jump back to the current day

### Views
Use the toggle buttons in the top-right of the sidebar header to switch between **List** and **Timeline** views. Set your preferred default in **Settings → Format → Default sidebar view**.

### Creating event notes
1. Click an event row to select it (highlighted)
2. Double-click, or run `Cmd+P → GCal: Create event note for selected event`
3. Edit the pre-filled title in the modal and press **Enter** or **Create**
4. The note is created in your configured folder and opens immediately

Once a note exists, a `[[]]` badge appears on the event row — click it to open the note directly.

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

1. Click **Refresh** under Settings → Calendars
2. Toggle off any calendars you don't want included
3. Optionally customize each calendar's color using the color swatch or hex input

## Settings reference

### Authentication
| Setting | Description |
|---|---|
| Client ID | OAuth 2.0 Client ID from Google Cloud Console |
| Client Secret | OAuth 2.0 Client Secret |
| Authorize | Opens a browser to grant calendar access |
| Refresh Token | Filled automatically after authorization |

### Event Notes
| Setting | Description |
|---|---|
| Event note folder | Folder where new event notes are created (e.g. `_tofile`) |
| Event note template | Path to a vault template file (e.g. `_templates/_meeting note.md`) |

Templates support these tokens: `{{summary}}`, `{{date}}`, `{{time}}`, `{{endTime}}`, `{{url}}`, `{{title}}`, `{{icsEventStart}}`, `{{icsEventEnd}}`, `{{icsEventUrl}}`

### Format
| Setting | Description |
|---|---|
| Default sidebar view | `Day list` or `Timeline` |
| Template placeholder | Token in your daily note template where events are inserted (default `{{gcal}}`) |
| Event format | Format string for each event line inserted into daily notes |

Event format placeholders: `{time}`, `{endTime}`, `{summary}`, `{url}`

### Calendars
Lists all calendars fetched from Google. Each has an enable/disable toggle and a color picker. Click **Refresh** to sync the list from Google.

## Commands

| Command | Description |
|---|---|
| `GCal: Open GCal Day View sidebar` | Opens the sidebar |
| `GCal: Insert Google Calendar events for this note` | Inserts events at cursor in the active daily note |
| `GCal: Create event note for selected event` | Creates a linked note for the selected sidebar event |

## Daily note filename formats

The plugin recognizes filenames in `YYYY-MM-DD` format (e.g. `2026-05-29.md`), the default used by the Obsidian Daily Notes core plugin.

## Development

```bash
git clone https://github.com/kails-ko/gcal-daily-notes
cd gcal-daily-notes
npm install
npm run dev
```

Copy the folder into your vault's `.obsidian/plugins/` directory and enable it in Obsidian.
