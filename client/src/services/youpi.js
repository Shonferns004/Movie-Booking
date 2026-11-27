/**
 * Loads the self-hosted YouPI checkout SDK (`/youpi.js`).
 *
 * The script is global: once it is on the page, every checkout reuses the same
 * instance. A failed load clears the cached promise so a retry can work.
 */
let youpiScriptPromise = null;

export function loadYoupiScript(scriptUrl, merchantKey, { apiUrl, portalUrl } = {}) {
  if (typeof window !== 'undefined' && window.Youpi) return Promise.resolve(window.Youpi);
  if (youpiScriptPromise) return youpiScriptPromise;

  youpiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    if (merchantKey) script.setAttribute('data-youpi-key', merchantKey);
    if (apiUrl) script.setAttribute('data-api-url', apiUrl);
    if (portalUrl) script.setAttribute('data-portal-url', portalUrl);
    script.setAttribute('data-currency', 'INR');
    script.setAttribute('data-name', 'Konkani Samudai');
    script.setAttribute('data-theme-color', '#C8FF1F');
    script.onload = () => {
      if (window.Youpi) resolve(window.Youpi);
      else reject(new Error('Youpi SDK unavailable'));
    };
    script.onerror = () => reject(new Error('Failed to load the secure payment window'));
    document.head.appendChild(script);
  }).catch((error) => {
    youpiScriptPromise = null;
    throw error;
  });

  return youpiScriptPromise;
}

/**
 * Opens the YouPI payment sheet. Falls back to the hosted checkout in a new tab
 * when the SDK cannot open (popup blockers, very old browser).
 */
export async function openYoupiCheckout(order, { name, phone, email, description, onSuccess, onFailed, onCancelled } = {}) {
  // Never put the customer token or contact PII in the checkout URL: query strings
  // leak through browser history, logs, and referrer headers. The SDK receives the
  // customer fields in its request body, and the server marks a verified signed-in
  // caller with skipCustomerAuth in gateway metadata.
  let checkoutUrl = order.checkoutUrl;
  try {
    if (checkoutUrl && typeof window !== 'undefined') {
      const url = new URL(checkoutUrl);
      url.searchParams.set('youpiParentOrigin', window.location.origin);
      checkoutUrl = url.toString();
    }
  } catch {
    // Keep the plain URL if it cannot be parsed.
  }

  try {
    const Youpi = await loadYoupiScript(order.scriptUrl, order.merchantKey, {
      apiUrl: order.apiUrl,
      portalUrl: order.portalUrl,
    });

    const options = {
      key: order.merchantKey,
      paymentId: order.paymentId,
      checkoutUrl,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Konkani Samudai',
      description,
      portalUrl: order.portalUrl,
      apiUrl: order.apiUrl,
      theme: { color: '#C8FF1F' },
      customer: {
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
      },
      onSuccess,
      onFailed,
      onCancelled,
    };

    if (typeof Youpi?.pay === 'function') {
      await Youpi.pay(options);
      return 'sdk';
    }
    if (typeof Youpi?.open === 'function') {
      Youpi.open(options);
      return 'sdk';
    }
    throw new Error('Payment SDK did not initialise');
  } catch {
    if (order.checkoutUrl) {
      window.open(order.checkoutUrl, '_blank', 'noopener');
      return 'tab';
    }
    throw new Error('Could not open the payment window');
  }
}

export default loadYoupiScript;
