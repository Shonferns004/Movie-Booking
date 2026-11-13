import { DurableObject } from 'cloudflare:workers';

/**
 * Fan-out hub for realtime events.
 *
 * The Neon subscription is held by the always-on Node host (see
 * `server/src/realtime/relay.js`) because the SDK's WebSocket does not survive in the
 * Workers runtime. That host POSTs `{ topic }` to `/api/v1/internal/realtime`, which
 * lands here and is broadcast to every connected app as
 * `{ type: 'change', topic }`.
 *
 * Events carry no data, so the socket is readable without a session; a signed-in token
 * is verified by the Worker when one is supplied.
 */
const MAX_CLIENTS = 100;

export class RealtimeHub extends DurableObject<Env> {
	private clients = new Set<WebSocket>();
	private lastEventAt = 0;
	private lastTopic: string | null = null;
	private emitted = 0;

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Internal publish endpoint, called by the Node relay (already authenticated by
		// the Worker before it gets here).
		if (url.pathname === '/emit') {
			if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
			const body: any = await request.json().catch(() => ({}));
			const topic = typeof body?.topic === 'string' ? body.topic : 'catalog';
			this.broadcast(topic);
			return Response.json({ ok: true, topic, clients: this.clients.size, emitted: this.emitted });
		}

		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return new Response('Expected a WebSocket upgrade', { status: 426 });
		}

		if (this.clients.size >= MAX_CLIENTS) {
			return new Response('Too many realtime clients', { status: 503 });
		}

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		server.accept();
		this.clients.add(server);

		const drop = () => this.clients.delete(server);
		server.addEventListener('close', drop);
		server.addEventListener('error', drop);

		server.send(
			JSON.stringify({
				type: 'ready',
				realtime: true,
				clients: this.clients.size,
				lastEventAt: this.lastEventAt || null,
				lastTopic: this.lastTopic,
				emitted: this.emitted,
			}),
		);

		return new Response(null, { status: 101, webSocket: client });
	}

	private broadcast(topic: string) {
		this.emitted++;
		this.lastEventAt = Date.now();
		this.lastTopic = topic;

		const payload = JSON.stringify({ type: 'change', topic, at: this.lastEventAt });
		for (const socket of this.clients) {
			try {
				socket.send(payload);
			} catch {
				this.clients.delete(socket);
			}
		}
	}
}
