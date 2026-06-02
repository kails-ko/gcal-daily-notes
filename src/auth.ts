import { Notice } from 'obsidian';
import * as http from 'http';
import { GCalSettings } from './settings';

const REDIRECT_PORT = 42813;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

export function buildAuthUrl(clientId: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: SCOPES,
		access_type: 'offline',
		prompt: 'consent',
	});
	return `${AUTH_URL}?${params.toString()}`;
}

export function startOAuthFlow(
	settings: GCalSettings,
	onSuccess: (refreshToken: string) => Promise<void>,
): void {
	if (!settings.clientId || !settings.clientSecret) {
		new Notice('Enter your Client ID and Client Secret in settings first.');
		return;
	}

	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);
		if (url.pathname !== '/callback') {
			res.end();
			return;
		}

		const code = url.searchParams.get('code');
		const error = url.searchParams.get('error');

		if (error || !code) {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end('<h2>Authorization failed. You can close this tab.</h2>');
			server.close();
			new Notice('Google authorization failed.');
			return;
		}

		try {
			const refreshToken = await exchangeCodeForToken(code, settings);
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end('<h2>Authorized! You can close this tab and return to Obsidian.</h2>');
			server.close();
			await onSuccess(refreshToken);
			new Notice('Google Calendar authorized successfully.');
		} catch (e) {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end('<h2>Token exchange failed. Check Obsidian for details.</h2>');
			server.close();
			new Notice(`OAuth error: ${(e as Error).message}`);
		}
	});

	server.listen(REDIRECT_PORT, () => {
		const authUrl = buildAuthUrl(settings.clientId);
		// Must use shell.openExternal to open in the system browser, not Electron's internal one
		const { shell } = require('electron');
		shell.openExternal(authUrl);
		new Notice('Browser opened — authorize Google Calendar access.');
	});

	// Auto-close server after 5 minutes if not used
	setTimeout(() => server.close(), 5 * 60 * 1000);
}

async function exchangeCodeForToken(code: string, settings: GCalSettings): Promise<string> {
	const body = new URLSearchParams({
		code,
		client_id: settings.clientId,
		client_secret: settings.clientSecret,
		redirect_uri: REDIRECT_URI,
		grant_type: 'authorization_code',
	});

	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});

	const data = await response.json() as { refresh_token?: string; error?: string };

	if (!response.ok || !data.refresh_token) {
		throw new Error(data.error ?? 'No refresh token returned');
	}

	return data.refresh_token;
}

export async function getAccessToken(settings: GCalSettings): Promise<string> {
	const body = new URLSearchParams({
		client_id: settings.clientId,
		client_secret: settings.clientSecret,
		refresh_token: settings.refreshToken,
		grant_type: 'refresh_token',
	});

	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});

	const data = await response.json() as { access_token?: string; error?: string };

	if (!response.ok || !data.access_token) {
		throw new Error(data.error ?? 'Failed to refresh access token');
	}

	return data.access_token;
}
