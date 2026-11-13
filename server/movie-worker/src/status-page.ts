/**
 * Same-origin status page + gateway probe.
 *
 * The dashboard is served by the Worker itself (`/status`) so its fetches are not
 * cross-origin; the Render gateway has no CORS headers of its own, so its health check
 * is proxied here instead of being fetched by the browser.
 */
import statusHtml from './status.html';

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function handleStatusPage(): Response {
	return new Response(statusHtml, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
		},
	});
}

/** Reachability of the Render-hosted YouPI gateway, measured from the edge. */
export async function handleGatewayStatus(env: Env): Promise<Response> {
	const bindings = env as Env & { YOUPI_API_URL?: string; YOUPI_PUBLIC_BASE_URL?: string };
	const configured = bindings.YOUPI_API_URL || '';
	if (!configured) {
		return json({ ok: false, configured: false, error: 'YOUPI_API_URL is not set' }, 503);
	}

	const origin = configured.replace(/\/youpi\/?$/, '').replace(/\/+$/, '');
	const started = Date.now();

	try {
		const res = await fetch(`${origin}/health`, {
			signal: AbortSignal.timeout(20000),
			cache: 'no-store',
		});
		const body: any = await res.json().catch(() => ({}));
		return json({
			ok: res.ok,
			status: res.status,
			ms: Date.now() - started,
			service: body?.service ?? null,
		});
	} catch (err: any) {
		return json(
			{
				ok: false,
				ms: Date.now() - started,
				error: err?.message || 'unreachable',
			},
			502,
		);
	}
}
