'use strict';
/* Approval emails. When something waits for a teacher or an admin (a new account request, a tool or a team plan sent for review), one short
   email goes to the admin. Requests that come close together are collected into one digest, so a class that signs up in one lesson sends one
   email and not thirty.

   It uses Resend's HTTPS API (no package needed) and switches itself off when it is not set up:
     RESEND_API_KEY   the API key from resend.com
     NOTIFY_EMAIL     who gets the emails (the address the Resend account was made with, unless a domain is verified at Resend)
     NOTIFY_FROM      optional sender, default "Smart Cities <onboarding@resend.dev>"
     SITE_URL         optional, the address of this site for the link in the email (the Railway domain is used when it is not set)
     NOTIFY_DELAY_MIN optional, minutes to collect requests before one email goes out (default 5)
   An email only ever holds a display name, a school, a team name and a link. Never a password, a token or a code. */

const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,}$/;
const MAX_LINES = 25;

const oneLine = (s, max = 60) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function createNotifier(opts = {}) {
  const env = opts.env || process.env;
  const log = opts.log || ((m) => console.log(m));
  const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  const key = String(opts.apiKey != null ? opts.apiKey : env.RESEND_API_KEY || '').trim();
  const to = String(opts.to != null ? opts.to : env.NOTIFY_EMAIL || '').trim();
  const from = String(opts.from || env.NOTIFY_FROM || 'Smart Cities <onboarding@resend.dev>').trim();
  const delayMs = opts.delayMs != null ? opts.delayMs : Math.max(1, Number(env.NOTIFY_DELAY_MIN) || 5) * 60000;
  const perDay = opts.perDay || 24;
  const enabled = Boolean(key && EMAIL_RE.test(to) && doFetch);

  const siteUrl = () => {
    const u = String(opts.siteUrl || env.SITE_URL || (env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : '')).trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(u) ? u : '';
  };

  let queue = [];
  let timer = null;
  const sentAt = [];

  function describe(e) {
    if (e.kind === 'account') return `${oneLine(e.name)} · ${oneLine(e.school)}${e.role === 'teacher' ? ' · teacher' : e.team ? ' · team ' + oneLine(e.team) : ''}${e.newTeam ? ' · asks for a new team: ' + oneLine(e.newTeam) : ''}`;
    return `"${oneLine(e.title, 70)}"${e.team ? ' · ' + oneLine(e.team) : ''}${e.school ? ' · ' + oneLine(e.school) : ''}`;
  }

  function compose(events) {
    const groups = [
      ['account', 'New accounts waiting for approval'],
      ['tool', 'Tools sent for review'],
      ['plan', 'Team plans sent for review'],
    ];
    const n = events.length;
    const lines = [`${n === 1 ? '1 thing is' : n + ' things are'} waiting for you on the Smart Cities site.`, ''];
    for (const [kind, title] of groups) {
      const list = events.filter((e) => e.kind === kind);
      if (!list.length) continue;
      lines.push(`${title} (${list.length})`);
      for (const e of list.slice(0, MAX_LINES)) lines.push('- ' + describe(e));
      if (list.length > MAX_LINES) lines.push(`- and ${list.length - MAX_LINES} more`);
      lines.push('');
    }
    const base = siteUrl();
    lines.push(base ? `Open Approvals: ${base}/#/approvals` : 'Open the Approvals page on the site to decide.');
    lines.push('', 'You get one email at most every few minutes, and only when something new arrives.');
    const kinds = new Set(events.map((e) => e.kind));
    const what = kinds.size === 1 ? { account: n === 1 ? 'new account' : 'new accounts', tool: n === 1 ? 'tool' : 'tools', plan: n === 1 ? 'plan' : 'plans' }[[...kinds][0]] : 'items';
    return { subject: `Smart Cities: ${n} ${what} waiting for approval`, text: lines.join('\n') };
  }

  async function send(msg) {
    const r = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: msg.subject, text: msg.text }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
    });
    if (!r.ok) {
      let detail = '';
      try { detail = oneLine(await r.text(), 160); } catch (e) { /* no body */ }
      throw new Error('Resend answered ' + r.status + (detail ? ': ' + detail : ''));
    }
  }

  async function flush() {
    timer = null;
    const batch = queue; queue = [];
    // Something that was decided in the meantime (an account approved, a tool already reviewed) is not worth an email.
    const live = batch.filter((e) => { try { return !e.stillWaiting || e.stillWaiting(); } catch (x) { return true; } });
    if (!live.length) return { sent: false, reason: 'nothing waiting' };
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] > 86400000) sentAt.shift();
    if (sentAt.length >= perDay) { log('Approval email skipped: the daily limit of ' + perDay + ' was reached'); return { sent: false, reason: 'daily limit' }; }
    try {
      await send(compose(live));
      sentAt.push(now);
      return { sent: true, count: live.length };
    } catch (e) {
      log('Approval email failed: ' + (e && e.message));
      const again = live.filter((x) => (x.tries = (x.tries || 0) + 1) <= 2);   // two more tries, then it is dropped (the Approvals page still shows everything)
      if (again.length) { queue = again.concat(queue); schedule(Math.max(delayMs, 10 * 60000)); }
      return { sent: false, reason: 'failed' };
    }
  }

  function schedule(ms) {
    if (timer) return;
    timer = setTimeout(() => { flush().catch((e) => log('Approval email error: ' + (e && e.message))); }, ms);
    if (timer.unref) timer.unref();
  }

  /* event({ kind: 'account'|'tool'|'plan', ... , stillWaiting?: () => boolean })  never throws and never waits. */
  function event(e) {
    try {
      if (!enabled || !e || !['account', 'tool', 'plan'].includes(e.kind)) return;
      queue.push(e);
      if (queue.length > 500) queue = queue.slice(-500);
      schedule(delayMs);
    } catch (x) { /* a notification must never break the request that caused it */ }
  }

  if (enabled) log('Approval emails on: collecting for ' + Math.round(delayMs / 60000) + ' min, then one email to ' + to.replace(/^(.).*(@.*)$/, '$1***$2'));
  else log('Approval emails off: set RESEND_API_KEY and NOTIFY_EMAIL to get an email when something waits for approval.');

  return { enabled, event, flush, compose, status: () => ({ enabled, to: enabled ? to.replace(/^(.).*(@.*)$/, '$1***$2') : null, waiting: queue.length }), close() { if (timer) clearTimeout(timer); timer = null; } };
}

module.exports = { createNotifier, oneLine };
