import { PaymentObserverClient } from '@youpi/observer-sdk';
import { getObserverToken } from '@youpi/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { BankEmailParser } from './parser.js';

const KNOWN_BANK_DOMAINS = [
  'hdfcbank.net', 'hdfcbank.com',
  'icicibank.com',
  'sbi.co.in', 'onlinesbi.com', 'sbicard.com',
  'axisbank.com',
  'kotak.com', 'kotak.co.in',
  'paytmbank.com', 'paytm.com',
  'yesbank.in', 'pnb.co.in',
  'bankofbaroda.co.in', 'bankofbaroda.com', 'bankofbaroda.in',
  'indusind.com',
  'idfcfirstbank.com', 'idfcbank.com',
  'canarabank.com',
  'unionbankofindia.co.in',
  'federalbank.co.in',
  'idbibank.com', 'idbi.com',
  'rblbank.com', 'aubank.in', 'bandhanbank.com',
  'southindianbank.com', 'csb.co.in', 'dcbbank.com',
];

/** Mirrors the verification pipeline's sender allowlist. */
function isAcceptedBankSender(domain) {
  if (!domain) return false;
  return (
    domain.endsWith('.bank.in') ||
    domain.endsWith('.fin.in') ||
    domain === 'bank.in' ||
    domain === 'fin.in' ||
    domain.endsWith('.youpi.local') ||
    KNOWN_BANK_DOMAINS.some((root) => domain === root || domain.endsWith(`.${root}`))
  );
}

function extractBodyFromGmailPayload(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, 'base64url').toString('utf8');
    } catch {}
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        try {
          return Buffer.from(part.body.data, 'base64url').toString('utf8');
        } catch {}
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        try {
          const html = Buffer.from(part.body.data, 'base64url').toString('utf8');
          return html.replace(/<[^>]+>/g, ' ');
        } catch {}
      }
    }
    for (const part of payload.parts) {
      if (part.body?.data) {
        try {
          return Buffer.from(part.body.data, 'base64url').toString('utf8');
        } catch {}
      }
    }
  }
  return '';
}

export class GmailPoller {
  /**
   * @param {{
   *   apiBaseUrl?: string,
   *   receivingAccountId?: string,
   *   pollIntervalMs?: number
   * }} options
   */
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || process.env.BASE_PAYMENT_API_URL || 'http://localhost:6100';
    this.receivingAccountId = options.receivingAccountId || '00000000-0000-0000-0000-000000000002';
    this.pollIntervalMs = options.pollIntervalMs || Number(process.env.GMAIL_POLL_INTERVAL_MS || 5000);
    this.observerClient = new PaymentObserverClient({
      apiBaseUrl: this.apiBaseUrl,
      sourceName: 'GMAIL'
    });

    this.isRunning = false;
    this.mode = 'STANDBY';
    this.timer = null;
    this.lastPollAt = null;
    this.lastEmailAt = null;
    this.observedCount = 0;
    this.credentials = null;
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
    this.processedMessageIds = new Set();
    this.imap = null;
    this.imapReconnect = null;
    this.processedUids = new Set();
  }

  setCredentials(creds) {
    this.credentials = { ...(this.credentials || {}), ...creds };
  }

  async fetchCredentialsFromPaymentApi() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/admin/gmail/credentials`, { headers: { Authorization: `Bearer ${getObserverToken()}` } });
      if (res.ok) {
        const data = await res.json();
        const conf = data.gmailConfig || data;
        if (conf.refreshToken || conf.clientId || conf.imapUser || conf.imapAppPassword) {
          this.setCredentials({
            clientId: conf.clientId,
            clientSecret: conf.clientSecret,
            refreshToken: conf.refreshToken,
            connectedEmail: conf.connectedEmail,
            imapUser: conf.imapUser,
            imapAppPassword: conf.imapAppPassword
          });
        }
      }
    } catch {}
  }

  async getAccessToken() {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedAccessToken;
    }

    if (!this.credentials?.refreshToken || !this.credentials?.clientId || !this.credentials?.clientSecret) {
      await this.fetchCredentialsFromPaymentApi();
    }

    const { clientId, clientSecret, refreshToken } = this.credentials || {};
    if (!clientId || !clientSecret || !refreshToken) return null;

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (!tokenRes.ok) {
        return null;
      }

      const tokenData = await tokenRes.json();
      this.cachedAccessToken = tokenData.access_token;
      this.tokenExpiresAt = Date.now() + ((tokenData.expires_in || 3500) - 120) * 1000;
      return this.cachedAccessToken;
    } catch (err) {
      console.warn('[Gmail Observer] Failed to refresh Google access token:', err.message);
      return null;
    }
  }

  async resolveActiveReceivingAccount() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/pollers/active-window`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && data.sessions.length > 0) {
          return data.sessions[0].receivingAccountId;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Ingests an email directly (e.g. from webhook, push notification, or manual poll).
   * @param {{ subject: string, body: string, date?: string | Date, from?: string, id?: string }} email
   */
  async processEmail(email) {
    // The verification pipeline only accepts official bank alert domains. Skip
    // unrelated inbox mail (KYC, DigiLocker, marketing...) before submission so the
    // log is not filled with expected rejections.
    const senderRaw = String(email.fromAddress || email.from || '');
    const domainMatch = senderRaw.match(/@([A-Za-z0-9.-]+)/);
    const senderDomain = domainMatch
      ? domainMatch[1].toLowerCase().replace(/[>),;]+$/, '')
      : '';
    const isBankDomain =
      isAcceptedBankSender(senderDomain) ||
      email.isTest ||
      String(email.from || '').trim() === 'TEST';

    if (!isBankDomain && !email.isTest) {
      if (this._lastSkippedDomain !== senderDomain) {
        this._lastSkippedDomain = senderDomain;
        console.log(
          `[Gmail Observer] ignoring non-bank sender "${senderDomain || 'unknown'}" (not a bank alert sender)`,
        );
      }
      return { accepted: false, skipped: true, reason: 'NON_BANK_SENDER' };
    }

    let parsed = null;
    try {
      parsed = BankEmailParser.parse(email);
    } catch {}

    let targetAccountId = this.receivingAccountId;
    try {
      const activeAcct = await this.resolveActiveReceivingAccount();
      if (activeAcct) targetAccountId = activeAcct;
    } catch {}

    const sender = email.from || email.sender || 'alerts@retail.bank.in';
    const rawContent = `${email.subject || ''}\n${email.body || ''}`.trim();

    try {
      const result = await this.observerClient.submitObservation({
        receivingAccountId: targetAccountId,
        amountPaise: parsed ? parsed.amountPaise : undefined,
        amount: parsed ? parsed.amount : undefined,
        observedAt: email.date ? new Date(email.date) : new Date(),
        bankReferenceNumber: parsed?.bankReferenceNumber,
        senderVpa: parsed?.senderVpa,
        sender,
        rawText: rawContent,
        rawPayload: {
          messageId: email.id || email.messageId || `gmail_${Date.now()}`,
          subject: email.subject || '',
          body: email.body || '',
          snippet: parsed?.rawSnippet || (email.body || '').substring(0, 200),
          from: sender,
          sender,
          source: 'GMAIL',
          internalDate: email.internalDate || (email.date ? new Date(email.date).getTime() : Date.now())
        }
      });

      this.observedCount++;
      return result;
    } catch (err) {
      console.error('[Gmail Observer] Submission failed:', err.message);
      throw err;
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._startMode().catch((err) => {
      console.warn('[Gmail Observer] Startup error:', err.message);
      this._startApiPolling();
    });
  }

  async _startMode() {
    await this.fetchCredentialsFromPaymentApi();

    const hasImap = Boolean(this.credentials?.imapUser && this.credentials?.imapAppPassword);
    if (hasImap) {
      try {
        await this._startImap();
        return;
      } catch (err) {
        console.warn('[Gmail Observer] IMAP unavailable, falling back to Gmail API poll:', err.message);
      }
    }

    const hasOAuth = Boolean(this.credentials?.refreshToken && this.credentials?.clientId);
    if (hasOAuth) {
      this._startApiPolling();
      return;
    }

    console.log('[Gmail Observer] No Gmail credentials yet — waiting for the admin panel.');
  }

  _startApiPolling() {
    if (!this.isRunning || this.timer) return;
    this.mode = 'API';
    console.log(`[Gmail Observer] Gmail API poller started (interval: ${this.pollIntervalMs}ms)`);

    // Run first poll cycle immediately
    this.pollCycle().catch(() => {});

    this.timer = setInterval(() => {
      this.pollCycle().catch(() => {});
    }, this.pollIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  async _startImap() {
    const user = String(this.credentials.imapUser || '').trim();
    const pass = String(this.credentials.imapAppPassword || '').replace(/\s+/g, '');
    if (!user || !pass) throw new Error('missing IMAP credentials');

    this._closeImap();

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });
    this.imap = client;

    client.on('error', (err) => console.warn('[Gmail Observer] IMAP error:', err.message));
    client.on('close', () => {
      this.imap = null;
      if (!this.isRunning) return;
      clearTimeout(this.imapReconnect);
      this.imapReconnect = setTimeout(() => {
        this._startMode().catch(() => {});
      }, 5000);
      if (this.imapReconnect.unref) this.imapReconnect.unref();
    });
    client.on('exists', () => {
      this._drainImap(8).catch((err) =>
        console.warn('[Gmail Observer] IMAP drain error:', err.message),
      );
    });

    await client.connect();

    // Watch Gmail's All Mail when available. Bank alerts are often filtered into a
    // label (or archived) by Gmail rules, and watching INBOX alone silently missed
    // them, leaving paid sessions unverified.
    let mailboxPath = 'INBOX';
    try {
      const boxes = await client.list();
      const allMail =
        boxes.find((box) => box.specialUse === '\\All') ||
        boxes.find((box) => /\/(all mail|all)$/i.test(box.path));
      if (allMail?.path) mailboxPath = allMail.path;
    } catch {}
    await client.mailboxOpen(mailboxPath);

    this.mode = 'IMAP';
    this.lastPollAt = new Date();
    console.log(`[Gmail Observer] IMAP push connected for ${user} (watching ${mailboxPath})`);
    await this._drainImap(25);
  }

  async _drainImap(limit = 8) {
    const client = this.imap;
    if (!client || !client.usable) return;
    const exists = client.mailbox?.exists || 0;
    if (!exists) return;

    this.lastPollAt = new Date();
    const from = Math.max(1, exists - limit + 1);
    for await (const message of client.fetch(`${from}:*`, { source: true, uid: true })) {
      if (!message?.source) continue;
      const key = String(message.uid ?? `${from}_${message.seq}`);
      if (this.processedUids.has(key)) continue;

      try {
        const parsed = await simpleParser(message.source);
        const body = parsed.text
          || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '');

        const result = await this.processEmail({
          id: `imap_${key}`,
          messageId: parsed.messageId || `imap_${key}`,
          subject: parsed.subject || '',
          body,
          from: parsed.from?.text || '',
          fromAddress: parsed.from?.value?.[0]?.address || '',
          date: parsed.date || new Date(),
        });

        if (result?.accepted) this.lastEmailAt = new Date();

        this.processedUids.add(key);
        if (this.processedUids.size > 800) {
          const firstKey = this.processedUids.values().next().value;
          this.processedUids.delete(firstKey);
        }
      } catch (err) {
        console.warn('[Gmail Observer] IMAP message error:', err.message);
      }
    }
  }

  _closeImap() {
    clearTimeout(this.imapReconnect);
    this.imapReconnect = null;
    if (this.imap) {
      try {
        this.imap.close();
      } catch {}
      this.imap = null;
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._closeImap();
    this.isRunning = false;
    this.mode = 'STANDBY';
    this._isPolling = false;
    console.log('[Gmail Observer] Poller stopped.');
  }

  async pollCycle() {
    if (this._isPolling) return;
    this._isPolling = true;

    try {
      this.lastPollAt = new Date();
      const accessToken = await this.getAccessToken();
      if (!accessToken) return;

      const query = encodeURIComponent('subject:(credit OR credited OR received OR upi OR deposit OR alert)');
      const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${query}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000)
      });

      if (!listRes.ok) {
        if (listRes.status === 401) {
          this.cachedAccessToken = null;
        }
        return;
      }

      const listData = await listRes.json();
      const messages = listData.messages || [];

      for (const m of messages) {
        if (this.processedMessageIds.has(m.id)) continue;

        try {
          const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(8000)
          });
          if (!msgRes.ok) continue;

          const msgData = await msgRes.json();
          const headers = msgData.payload?.headers || [];
          const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
          const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
          const dateStr = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
          const body = extractBodyFromGmailPayload(msgData.payload) || msgData.snippet || '';

          await this.processEmail({
            id: m.id,
            messageId: m.id,
            subject,
            body,
            from,
            date: dateStr ? new Date(dateStr) : new Date(Number(msgData.internalDate || Date.now()))
          });

          this.processedMessageIds.add(m.id);
          if (this.processedMessageIds.size > 500) {
            const firstKey = this.processedMessageIds.values().next().value;
            this.processedMessageIds.delete(firstKey);
          }
        } catch (msgErr) {
          console.warn(`[Gmail Observer] Error fetching message ${m.id}:`, msgErr.message);
        }
      }
    } catch (err) {
      console.warn('[Gmail Observer] pollCycle error:', err.message);
    } finally {
      this._isPolling = false;
    }
  }
}
