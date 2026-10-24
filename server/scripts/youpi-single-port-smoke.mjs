/**
 * Smoke test for the single-port YouPI PG integration.
 * Boots a second API instance on :4100 (the dev server on :4000 keeps running)
 * and exercises the gateway surface through the movie API's own port.
 */
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:4100';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

function show(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  // 1. health
  const health = await req('/health');
  show('GET /health', health.status === 200, `status ${health.status}`);

  // 2. SDK script through the gateway
  const sdk = await req('/youpi.js');
  show('GET /youpi.js', sdk.status === 200 && sdk.text.includes('YoupiCheckout'), `status ${sdk.status}, ${sdk.text.length}b`);

  // 3. core API through the gateway prefix
  const notFound = await req('/youpi/api/v1/payments/does-not-exist');
  show(
    'GET /youpi/api/v1/payments/:id reaches the core',
    notFound.status === 404 && /not found/i.test(notFound.text),
    `status ${notFound.status}`
  );

  // 4. admin surface is token protected (never public)
  const admin = await req('/youpi/api/v1/admin/merchants');
  show('GET /youpi/api/v1/admin/* requires the admin token', admin.status === 401 || admin.status === 403, `status ${admin.status}`);

  // 5. create a payment session straight through the gateway
  const orderId = `order_test_${Date.now()}`;
  const created = await req('/youpi/api/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Merchant-Id': '00000000-0000-0000-0000-000000000001',
      'Idempotency-Key': orderId,
    },
    body: JSON.stringify({ orderId, amount: '150.00', currency: 'INR', description: 'single port smoke test' }),
  });
  let session = {};
  try {
    session = JSON.parse(created.text);
  } catch {
    /* handled below */
  }
  show('POST /youpi/api/v1/payments creates a session', (created.status === 200 || created.status === 201) && !!session.paymentId, `status ${created.status} ${created.text.slice(0, 160)}`);

  // 6. checkout page renders and points its API calls at the gateway prefix
  if (session.paymentId) {
    const page = await req(`/checkout/${session.paymentId}`);
    const usesPrefix = page.text.includes('const API_BASE = "/youpi"');
    show('GET /checkout/:id renders', page.status === 200 && page.text.includes('YOUPI'), `status ${page.status}`);
    show('checkout page uses the /youpi API prefix', usesPrefix);

    const css = await req('/css/checkout.css');
    show('GET /css/checkout.css serves the portal asset', css.status === 200 && css.text.includes('{'), `status ${css.status}`);

    const icon = await req('/icons/upi.svg');
    show('GET /icons/upi.svg serves the portal asset', icon.status === 200, `status ${icon.status}`);

    // 7. the checkout page's own API call path
    const state = await req(`/youpi/api/v1/checkout/${session.paymentId}/state`);
    show('GET /youpi/api/v1/checkout/:id/state reaches the core', state.status === 200 && !!state.text.includes(session.paymentId), `status ${state.status}`);

    // 8. QR svg endpoint
    const qr = await req(`/checkout/${session.paymentId}/qr.svg`);
    show('GET /checkout/:id/qr.svg renders the UPI QR', qr.status === 200 && qr.text.includes('<svg'), `status ${qr.status}`);
  }

  console.log('\ndone');
})().catch((e) => {
  console.error('smoke test crashed:', e);
  process.exit(1);
});
