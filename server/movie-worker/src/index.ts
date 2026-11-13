import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../../src/app-core.js';
import { configureHyperdrive, dbMiddleware, runWithDb } from '../../src/db/pool.js';
import { runTick } from '../../src/jobs/tick.js';
import { recordKeepAlive } from '../../src/jobs/keepalive.js';
import { verifyToken } from '../../src/modules/auth/service.js';
import { RealtimeHub } from './realtime-hub.js';
import { handleRedeploy } from './redeploy.js';
import { handleGatewayStatus, handleStatusPage } from './status-page.js';

/**
 * Cloudflare Workers entry point.
 *
 * Express is attached to the Workers fetch model with `httpServerHandler`. The port is
 * only a routing key - Workers has no listening sockets - but Express still needs
 * `app.listen()` to build its internal server.
 *
 * What is intentionally *not* here:
 *  - the embedded YouPI gateway: it spawns child processes, listens on localhost ports
 *    and keeps a SQLite file, so it has to stay on a Node host. Point
 *    YOUPI_API_URL / YOUPI_PUBLIC_BASE_URL at that host instead.
 *  - static assets (uploads, built SPAs): use Workers Assets or R2 for those.
 *  - the `RUN_WORKER` maintenance loop: Cron Triggers replace it (see `scheduled`).
 */
const PORT = 3000;

const app = createApp({ before: [dbMiddleware] });
app.listen(PORT);

const nodeHandler = httpServerHandler({ port: PORT });

type WorkerEnv = Env & {
	HYPERDRIVE?: { connectionString: string };
	DATABASE_URL?: string;
	REALTIME?: DurableObjectNamespace;
	INTERNAL_CRON_SECRET?: string;
};

/**
 * Hyperdrive is the production path. `DATABASE_URL` is the local fallback so
 * `wrangler dev` can talk to a database straight from `.dev.vars`.
 */
function configureDb(env: Env) {
	const localUrl = (env as Env & { DATABASE_URL?: string }).DATABASE_URL;
	configureHyperdrive(env.HYPERDRIVE?.connectionString || localUrl);
}

/**
 * Keeps the Render-hosted payment gateway awake.
 *
 * Render's free plan stops a service after ~15 minutes without traffic, which adds a
 * ~50s cold start to the next checkout. The cron already fires every minute, so a
 * plain GET every 5 minutes is enough to hold it open (288 requests/day).
 */
async function warmPaymentGateway(env: Env) {
	const base = (env as Env & { YOUPI_API_URL?: string }).YOUPI_API_URL;
	if (!base) return;
	if (new Date().getUTCMinutes() % 5 !== 0) return;

	try {
		const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
			signal: AbortSignal.timeout(25000),
		});
		console.log('[cron] gateway warmup', res.status);
	} catch (err) {
		console.error('[cron] gateway warmup failed', err);
	}
}

/** WebSocket endpoint: the Durable Object fans events out to every connected app. */
const REALTIME_PATH = '/api/v1/realtime';

/**
 * Durable Object instance name. A DO keeps running the code it started with, so bump
 * this when the hub changes.
 */
const REALTIME_OBJECT = 'catalog-v11';

function realtimeUpgrade(request: Request, env: Env): Response | Promise<Response> | null {
	const url = new URL(request.url);
	if (url.pathname !== REALTIME_PATH) return null;

	if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
		return new Response('Expected a WebSocket upgrade', { status: 426 });
	}

	// Events carry no data, so a session is optional; when one is supplied it must be
	// valid (a stale token would otherwise look like a working connection).
	const header = request.headers.get('authorization') || '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : (url.searchParams.get('token') || '');
	if (token) {
		try {
			verifyToken(token);
		} catch {
			return new Response('Unauthorized', { status: 401 });
		}
	}

	const namespace = (env as WorkerEnv).REALTIME;
	if (!namespace) return new Response('Realtime binding missing', { status: 503 });
	return namespace.get(namespace.idFromName(REALTIME_OBJECT)).fetch(request);
}

export { RealtimeHub };

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);

		if (pathname === '/api/v1/admin/redeploy') {
			return handleRedeploy(request, env);
		}
		if (pathname === '/api/v1/status/gateway') {
			return handleGatewayStatus(env);
		}
		if (pathname === '/status' || pathname === '/status.html') {
			return handleStatusPage();
		}

		// The always-on Node host holds the Neon subscription and posts events here.
		if (pathname === '/api/v1/internal/realtime') {
			const secret = (env as WorkerEnv).INTERNAL_CRON_SECRET;
			const auth = request.headers.get('authorization') || '';
			if (!secret || auth !== `Bearer ${secret}`) {
				return new Response('unauthorized', { status: 401 });
			}
			if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

			const namespace = (env as WorkerEnv).REALTIME;
			if (!namespace) return new Response('Realtime binding missing', { status: 503 });
			return namespace.get(namespace.idFromName(REALTIME_OBJECT)).fetch('https://realtime.internal/emit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: await request.text(),
			});
		}

		const upgrade = realtimeUpgrade(request, env);
		if (upgrade) return upgrade;

		configureDb(env);
		return nodeHandler.fetch!(request, env, ctx);
	},

	async scheduled(_controller, env, ctx) {
		configureDb(env);
		ctx.waitUntil(warmPaymentGateway(env));
		ctx.waitUntil(
			runWithDb(async () => {
				// Free-tier Postgres sleeps when idle: one row per two days keeps it alive.
				// The cron runs every minute, `recordKeepAlive` decides whether to write.
				try {
					console.log('[cron] keepalive', JSON.stringify(await recordKeepAlive()));
				} catch (err) {
					console.error('[cron] keepalive failed', err);
				}

				const result = await runTick();
				console.log('[cron] tick', JSON.stringify(result));
			}).catch((err) => console.error('[cron] tick failed', err)),
		);
	},
} satisfies ExportedHandler<Env>;
