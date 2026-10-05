import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHub } from '$lib/server/live';

/** Server-sent events: the browser's view of the shared upstream Cerberus socket. */
export const GET: RequestHandler = ({ locals, request }) => {
	const { token, uuid } = locals.session;
	if (!token || !uuid) error(401, 'Not signed in');
	const hub = getHub(token, uuid);
	const encoder = new TextEncoder();
	let unsubscribe = () => {};
	let keepAlive: NodeJS.Timeout | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const send = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};
			const cleanup = () => {
				unsubscribe();
				clearInterval(keepAlive);
			};
			unsubscribe = hub.subscribe((state) => send(`data: ${JSON.stringify(state)}\n\n`));
			keepAlive = setInterval(() => send(': ping\n\n'), 20_000);
			request.signal.addEventListener('abort', () => {
				cleanup();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			});
		},
		cancel() {
			unsubscribe();
			clearInterval(keepAlive);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
