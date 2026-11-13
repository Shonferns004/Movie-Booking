/**
 * "Redeploy" for the status dashboard.
 *
 * This re-deploys the newest *uploaded* version of the Worker through the Cloudflare
 * API, which restarts it and re-applies its bindings. It does NOT build new code from
 * git - for that, drive `wrangler deploy` from CI (see the status page notes).
 *
 * Requires two secrets: CF_API_TOKEN (Workers Scripts:Edit) and CF_ACCOUNT_ID.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleRedeploy(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

	const bindings = env as Env & {
		ADMIN_TOKEN?: string;
		CF_API_TOKEN?: string;
		CF_ACCOUNT_ID?: string;
		CF_SCRIPT_NAME?: string;
	};

	const supplied = request.headers.get('x-admin-token') || '';
	if (!bindings.ADMIN_TOKEN || supplied !== bindings.ADMIN_TOKEN) {
		return json({ error: 'unauthorized' }, 401);
	}

	if (!bindings.CF_API_TOKEN || !bindings.CF_ACCOUNT_ID) {
		return json(
			{
				error: 'redeploy is not configured',
				hint: 'npx wrangler secret put CF_API_TOKEN  (token needs Workers Scripts:Edit)',
				also: 'CF_ACCOUNT_ID (and optionally CF_SCRIPT_NAME) as vars or secrets',
			},
			501,
		);
	}

	const script = bindings.CF_SCRIPT_NAME || 'movie-worker';
	const endpoint = `https://api.cloudflare.com/client/v4/accounts/${bindings.CF_ACCOUNT_ID}/workers/scripts/${script}/deployments`;
	const headers = {
		authorization: `Bearer ${bindings.CF_API_TOKEN}`,
		'content-type': 'application/json',
	};

	const list = await fetch(endpoint, { headers });
	const listBody: any = await list.json().catch(() => ({}));
	if (!list.ok) {
		return json({ error: 'Cloudflare API rejected the listing request', status: list.status, detail: listBody }, 502);
	}

	const versionId = listBody?.result?.[0]?.versions?.[0]?.version_id;
	if (!versionId) return json({ error: 'no uploaded version found to deploy' }, 502);

	const deploy = await fetch(endpoint, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			strategy: 'percentage',
			versions: [{ version_id: versionId, percentage: 100 }],
		}),
	});
	const deployBody: any = await deploy.json().catch(() => ({}));

	return json(
		{
			ok: deploy.ok,
			script,
			versionId,
			deployedAt: new Date().toISOString(),
			detail: deploy.ok ? undefined : deployBody,
		},
		deploy.ok ? 200 : 502,
	);
}
