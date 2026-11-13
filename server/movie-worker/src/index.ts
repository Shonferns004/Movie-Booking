import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../../src/app-core.js';
import { configureHyperdrive, dbMiddleware, runWithDb } from '../../src/db/pool.js';
import { runTick } from '../../src/jobs/tick.js';
import { recordKeepAlive } from '../../src/jobs/keepalive.js';

/**
 * Cloudflare Workers entry point.
 *
 * Express is attached to the Workers fetch model with `httpServerHandler`. The port is
 * only a routing key - Workers has no listening sockets - but Express still needs
 * `app.listen()` to build its internal server.
 *
 * What is intentionally *not* here:
 *  - the embedded YouPI gateway: it spawns child processes, listens on localhost ports
 *    and keeps a SQLite file, so it has to stay on a Node host (Render). Point
 *    YOUPI_API_URL / YOUPI_PUBLIC_BASE_URL at that host instead.
 *  - static assets (uploads, built SPAs): use Workers Assets or R2 for those.
 *  - the `RUN_WORKER` maintenance loop: Cron Triggers replace it (see `scheduled`).
 */
const PORT = 3000;

const app = createApp({ before: [dbMiddleware] });
app.listen(PORT);

const nodeHandler = httpServerHandler({ port: PORT });

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
 *
 * The request itself is what wakes the service; if the cold start outlives
 * `waitUntil()`, the ping is still delivered and the next one lands on a warm host.
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

export default {
	fetch(request, env, ctx) {
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
