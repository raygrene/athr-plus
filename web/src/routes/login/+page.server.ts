import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { AtherHttpError, fetchScooters, requestOtp, verifyOtp } from '$lib/server/ather';
import { writeSession } from '$lib/server/session';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.session.token && locals.session.uuid) redirect(303, '/');
	return {
		pendingPhone: locals.session.pendingPhone ? maskPhone(locals.session.pendingPhone) : null,
		expired: url.searchParams.has('expired')
	};
};

const maskPhone = (p: string) => p.replace(/.(?=.{2})/g, '•');
const message = (e: unknown) => (e instanceof AtherHttpError || e instanceof Error ? e.message : 'Request failed');

export const actions: Actions = {
	request: async ({ request, cookies }) => {
		const form = await request.formData();
		const phone = String(form.get('phone') ?? '').replace(/[\s-]/g, '').replace(/^\+?91/, '');
		if (!/^\d{10}$/.test(phone)) return fail(400, { error: 'Enter your 10-digit registered mobile number.' });
		try {
			await requestOtp(phone, 'IN');
		} catch (e) {
			return fail(502, { error: message(e) });
		}
		writeSession(cookies, { pendingPhone: phone, pendingCountry: 'IN' });
		return { sent: true };
	},
	verify: async ({ request, cookies, locals }) => {
		const phone = locals.session.pendingPhone;
		if (!phone) return fail(400, { error: 'Request an OTP first.' });
		const otp = String((await request.formData()).get('otp') ?? '').trim();
		if (!/^\d{4,8}$/.test(otp)) return fail(400, { error: 'Enter the OTP from the SMS.' });
		let token: string;
		try {
			token = await verifyOtp(phone, otp, locals.session.pendingCountry ?? 'IN');
		} catch (e) {
			return fail(401, { error: message(e) });
		}
		let uuid: string | undefined;
		try {
			const scooters = await fetchScooters(token);
			if (scooters.length === 1) uuid = scooters[0].uuid;
		} catch {
			/* choose on /select */
		}
		writeSession(cookies, { token, uuid });
		redirect(303, uuid ? '/' : '/select');
	},
	restart: async ({ cookies }) => {
		writeSession(cookies, {});
		return {};
	}
};
