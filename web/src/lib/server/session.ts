/**
 * The Ather token lives only in an encrypted, httpOnly cookie, so it never
 * reaches browser JavaScript and nothing is stored on the server's disk.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

export interface Session {
	token?: string;
	uuid?: string;
	/** Phone number awaiting OTP verification; dropped once signed in. */
	pendingPhone?: string;
	pendingCountry?: string;
}

const COOKIE = 'athr_session';
const MAX_AGE = 60 * 60 * 24 * 30;

function key(): Buffer {
	const secret = env.SESSION_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error('SESSION_SECRET must be set to at least 32 characters (see web/env.example).');
	}
	return createHash('sha256').update(secret).digest();
}

export function seal(session: Session): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const data = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function unseal(value: string | undefined): Session {
	if (!value) return {};
	try {
		const buf = Buffer.from(value, 'base64url');
		const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
		decipher.setAuthTag(buf.subarray(12, 28));
		const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
		const parsed = JSON.parse(json);
		return typeof parsed === 'object' && parsed ? parsed : {};
	} catch {
		return {};
	}
}

export function readSession(cookies: Cookies): Session {
	return unseal(cookies.get(COOKIE));
}

export function writeSession(cookies: Cookies, session: Session) {
	cookies.set(COOKIE, seal(session), {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: !dev,
		maxAge: MAX_AGE
	});
}

export function clearSession(cookies: Cookies) {
	cookies.delete(COOKIE, { path: '/' });
}
