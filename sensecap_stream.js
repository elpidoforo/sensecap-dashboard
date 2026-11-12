'use strict';
/* sensecap_stream.js: SenseCAP readings by push (Seeed's OpenStream MQTT feed) instead of by polling.
 *
 * Without it, every refresh of "latest" costs about 17 REST calls (groups, device lists, three calls per chunk of devices, then one
 * call per device) and the SenseCAP API answers "busy" when it is asked too often. With it, the dashboard listens: every reading
 * SenseCAP receives is pushed to us, and the REST API is only used for the device list, for a slow safety check and as a fallback.
 *
 * OFF BY DEFAULT. Nothing here runs unless SENSECAP_MQTT=1, and then all of these must be set:
 *   SENSECAP_API_KEY        the access key (the broker's password; it is already used for the REST API)
 *   SENSECAP_ORG_ID         the organisation id from the SenseCAP portal (the broker's user name is org-<id>)
 *   SENSECAP_MQTT_TLS_PORT  the port of Seeed's broker that speaks TLS
 * Seeed's documentation (checked 2026-11-12) lists only port 1883 (plain MQTT) and 8083 (plain MQTT over WebSocket) and no TLS
 * port. The broker's login is our API key, so a plain connection is never made, under any setting: there is no setting for it,
 * the ports 1883, 8083 and 80 are refused here, and mqtt.js has no plain mode at all. Until Seeed names a TLS port and someone
 * tries it, the feature stays off. (Trying is safe: the key is written only after the TLS handshake has verified the broker.)
 * The host is fixed to Seeed's two hosts (SENSECAP_MQTT_HOST may pick the China one, or loopback for tests).
 *
 * What it does when on:
 *   - subscribes (QoS 0) to /device_sensor_data/<org>/+/+/+/+ and keeps the newest reading per device and measurement in memory,
 *     in the same shape the REST poller makes ({ v, t, ch }), so everything downstream (latestFor, privacy.stripGpsLatest, the
 *     assistant, the overview) is unchanged. GPS readings go through exactly the same privacy rules as REST ones: exact positions
 *     live only in this server's memory and in the 'exact' view, never in a log, never on disk, never in the public answers.
 *   - overlay(latest) lays the newest stream readings over what REST last returned (the newer reading of each measurement wins).
 *   - while the stream is healthy (connected, subscribed, and not silent for SENSECAP_MQTT_SILENT_MS), restTtl() stretches the time
 *     between REST refreshes: latest every 15 min (the safety poll), the device list every 5 min. It never drops to zero. When the
 *     stream is down or silent the normal polling returns at once.
 *   - a teacher switching the SenseCAP feed off disconnects the stream, switching it on connects again.
 * Messages are checked hard: our own organisation only, 7 topic levels, short alphanumeric ids, a JSON object of at most 1 KB,
 * a finite number, a time that is not in the future or older than 30 days, GPS inside the world and not exactly 0. At most 512
 * devices and 64 measurements per device are kept, and more than 1000 messages in one second are dropped.
 * Nothing is logged except state changes and counts: never the key, never a payload, never a position.
 */
const crypto = require('node:crypto');
const { createClient } = require('./mqtt');
const { GPS_MIDS } = require('./privacy');

const SEEED_HOSTS = new Set(['sensecap-openstream.seeed.cc', 'sensecap-openstream.seeed.cn']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const PLAIN_PORTS = new Set([1883, 8083, 80]);   // the plain ports Seeed documents, and HTTP
const MAX_DEVICES = 512, MAX_MIDS = 64, MAX_PER_SEC = 1000, MAX_PAYLOAD = 1024;
const EUI_RE = /^[A-Za-z0-9]{8,32}$/, ORG_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DAY = 86400000;

const clamp = (v, min, max, dflt) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt; };

/* Reads the settings. Never throws; `ok` says whether the stream may start and `reason` why not. */
function readConfig(env = process.env) {
  const asked = String(env.SENSECAP_MQTT || '') === '1';
  const base = { asked, ok: false, reason: 'off' };
  if (!asked) return base;
  const key = String(env.SENSECAP_API_KEY || '');
  const org = String(env.SENSECAP_ORG_ID || '').trim();
  const host = String(env.SENSECAP_MQTT_HOST || 'sensecap-openstream.seeed.cc').trim().toLowerCase();
  const portText = String(env.SENSECAP_MQTT_TLS_PORT || '').trim();
  const cfg = {
    ...base, host, org,
    safetyMs: clamp(env.SENSECAP_MQTT_SAFETY_MS, 1000, 3600000, 900000),    // REST "latest" while the stream is healthy
    devicesMs: clamp(env.SENSECAP_MQTT_DEVICES_MS, 1000, 3600000, 300000),  // REST device list while the stream is healthy
    silentMs: clamp(env.SENSECAP_MQTT_SILENT_MS, 1000, 6 * 3600000, 30 * 60000),   // no message for this long: not healthy
  };
  if (!key) return { ...cfg, reason: 'no-key' };
  if (!org) return { ...cfg, reason: 'no-org' };
  if (!ORG_RE.test(org)) return { ...cfg, reason: 'bad-org' };
  if (!SEEED_HOSTS.has(host) && !LOOPBACK.has(host)) return { ...cfg, reason: 'bad-host' };
  if (!portText) return { ...cfg, reason: 'no-tls-port' };
  const port = /^\d{1,5}$/.test(portText) ? Number(portText) : 0;
  if (port < 1 || port > 65535) return { ...cfg, reason: 'bad-port' };
  if (PLAIN_PORTS.has(port)) return { ...cfg, reason: 'plaintext-port' };
  const out = { ...cfg, ok: true, reason: 'ok', port };
  Object.defineProperty(out, 'key', { value: key, enumerable: false });   // the key does not show in JSON, spreads, console.log or util.inspect
  return out;
}

/* What kind of failure, in a word. Raw error texts can hold addresses, so only the kind is logged or shown. */
function errorKind(e) {
  const code = String((e && e.code) || ''), msg = String((e && e.message) || '');
  if (/^ECONNACK[45]$/.test(code)) return 'login';
  if (code === 'ETIMEDOUT') return 'timeout';
  if (/^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE)$/.test(code)) return 'network';
  if (code === 'ESECURE' || /CERT|SELF_SIGNED|UNABLE_TO_|HOSTNAME|certificate|altname|self.signed/i.test(code + ' ' + msg)) return 'certificate';
  if (/^ERR_(SSL|TLS)/.test(code)) return 'tls';
  if (code === 'EPROTO' || code === 'ESIZE') return 'protocol';
  return 'other';
}

function defaultToMs(t) {
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  const s = String(t).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n < 1e12 ? n * 1000 : n; }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return { en: `${s} s`, el: `${s} δευτ.` };
  const m = Math.round(s / 60);
  if (m < 90) return { en: `${m} min`, el: `${m} λεπτά` };
  const h = Math.round(m / 60);
  return { en: `${h} h`, el: `${h} ώρες` };
}

/* opts: env, isEnabled() (the teachers' switch for the SenseCAP feed), toMs (the server's time reader), log(line), now(),
 *       makeClient (a test can replace the MQTT client), watchMs (how often the teachers' switch is looked at; a test shortens it). */
function createSenseCapStream({ env = process.env, isEnabled = () => true, toMs = defaultToMs, log = () => {}, now = Date.now, makeClient = createClient, watchMs = 5000 } = {}) {
  const cfg = readConfig(env);
  const S = {
    started: false, running: false, subscribed: false, subscribedAt: 0, connectedAt: 0, lastMessageAt: 0, lastErrorKind: null,
    messages: 0, bad: 0, ignored: 0, dropped: 0, late: 0, reconnects: 0, loggedFailure: false, lastBadLog: 0, badLogged: 0,
    byEui: new Map(),   // EUI -> Map(measurement id -> { v, ms, ch })
  };
  const rate = { at: 0, n: 0 };
  let client = null, watch = null, prune = null;

  const switchedOff = () => { try { return !isEnabled(); } catch { return false; } };
  const active = () => cfg.ok && S.started && !switchedOff();
  const online = () => Boolean(client && client.online && S.subscribed);
  const healthy = () => active() && online() && now() - Math.max(S.subscribedAt, S.lastMessageAt) < cfg.silentMs;

  /* ----- messages ----- */
  // Returns true when a reading was stored. Never throws, never logs a payload.
  function handle(topic, payload) {
    const t = now();
    if (t - rate.at >= 1000) { rate.at = t; rate.n = 0; }
    if (++rate.n > MAX_PER_SEC) { S.dropped++; return false; }
    const parts = String(topic).split('/');
    // /device_sensor_data/<OrgID>/<DeviceEUI>/<Channel>/<Reserved>/<MeasurementID>
    if (parts.length !== 7 || parts[0] !== '' || parts[1] !== 'device_sensor_data' || parts[2] !== cfg.org) { S.ignored++; return false; }
    const eui = parts[3].toUpperCase(), chText = parts[4], mid = /^\d{1,6}$/.test(parts[6]) ? String(parseInt(parts[6], 10)) : null;
    if (!EUI_RE.test(eui) || !/^\d{1,3}$/.test(chText) || mid == null || !/^[A-Za-z0-9_-]{0,16}$/.test(parts[5])) { S.bad++; return false; }
    if (!payload || payload.length === 0 || payload.length > MAX_PAYLOAD) { S.bad++; return false; }
    let j;
    try { j = JSON.parse(payload.toString('utf8')); } catch { S.bad++; return false; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) { S.bad++; return false; }
    const raw = j.value;
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;   // the docs show both
    const ms = j.timestamp == null ? null : toMs(j.timestamp);
    if (!Number.isFinite(v) || Math.abs(v) > 1e9 || ms == null || !Number.isFinite(ms) || ms > t + 5 * 60000 || ms < t - 30 * DAY) { S.bad++; return false; }
    if (GPS_MIDS.has(mid)) {   // same rule as pairTrack: no fix (0) and impossible values are not positions
      const lim = mid === '4198' ? 90 : 180;
      if (v === 0 || Math.abs(v) > lim) { S.bad++; return false; }
    }
    let dev = S.byEui.get(eui);
    if (!dev) { if (S.byEui.size >= MAX_DEVICES) { S.dropped++; return false; } dev = new Map(); S.byEui.set(eui, dev); }
    const prev = dev.get(mid);
    if (!prev && dev.size >= MAX_MIDS) { S.dropped++; return false; }
    if (prev && prev.ms > ms) { S.late++; return false; }   // out of order: the newer reading stays
    dev.set(mid, { v, ms, ch: Number(chText) });
    S.messages++;
    S.lastMessageAt = t;
    return true;
  }

  function reportBad() {   // at most one line per 10 minutes, counts only
    const t = now(), n = S.bad - S.badLogged;
    if (n > 0 && t - S.lastBadLog > 600000) { S.lastBadLog = t; S.badLogged = S.bad; log(`SenseCAP live stream: ${n} messages could not be read and were skipped`); }
  }

  /* ----- what the server uses ----- */
  /** The REST answer with the newest stream readings laid over it. The REST answer itself is never changed (it is a shared cache entry). */
  function overlay(latest) {
    if (!active() || !S.byEui.size) return latest;
    const out = { ...(latest || {}) };
    for (const [eui, dev] of S.byEui) {
      let row = null;
      for (const [mid, r] of dev) {
        const cur = out[eui] && out[eui][mid];
        const curMs = cur ? toMs(cur.t) : null;
        if (cur && curMs != null && curMs >= r.ms) continue;   // REST has the same or a newer reading
        if (!row) row = { ...(out[eui] || {}) };
        row[mid] = { v: r.v, t: new Date(r.ms).toISOString(), ch: r.ch };
      }
      if (row) out[eui] = row;
    }
    return out;
  }
  /** How long a REST answer may be reused. Longer than `dflt` only while the stream is healthy; never shorter than `dflt`. */
  function restTtl(dflt, kind) {
    if (!healthy()) return dflt;
    return Math.max(dflt, kind === 'devices' ? cfg.devicesMs : cfg.safetyMs);
  }
  /** True when the stream is healthy and has readings, so they can stand in for a REST refresh that failed. */
  const serving = () => healthy() && S.byEui.size > 0;

  /* ----- the connection ----- */
  function connect() {
    if (!client || S.running) return;
    S.running = true;
    client.start();
  }
  function disconnect() {
    if (!client || !S.running) return;
    S.running = false; S.subscribed = false;
    client.stop();
  }
  function start() {
    if (!cfg.asked) return false;
    if (!cfg.ok) { log(`SenseCAP live stream: not started (${cfg.reason}); the REST API is used as before`); return false; }
    if (S.started) return true;
    S.started = true;
    const topic = `/device_sensor_data/${cfg.org}/+/+/+/+`;
    client = makeClient({
      host: cfg.host, port: cfg.port, clientId: `org-${cfg.org}-${crypto.randomBytes(4).toString('hex')}`,
      username: `org-${cfg.org}`, password: cfg.key, keepAlive: 60, maxPacket: 8192, connectTimeoutMs: 15000,
      reconnect: { minMs: 2000, maxMs: 300000, factor: 2, jitter: 0.5 },
    });
    client.subscribe(topic, 0);
    client.on('connect', () => { S.connectedAt = now(); });
    client.on('subscribed', () => {
      S.subscribed = true; S.subscribedAt = now(); S.loggedFailure = false;
      log('SenseCAP live stream: connected and subscribed (encrypted); REST polling is now slow');
    });
    client.on('subscribe-failed', () => { S.subscribed = false; S.lastErrorKind = 'subscribe'; log('SenseCAP live stream: the broker refused the subscription; REST polling stays normal'); });
    client.on('message', (t, p) => { handle(t, p); });
    client.on('error', (e) => { S.lastErrorKind = errorKind(e); });
    client.on('reconnect', () => { S.reconnects++; });
    client.on('close', ({ wasOnline }) => {
      const was = S.subscribed;
      S.subscribed = false;
      if (was || wasOnline) { log(`SenseCAP live stream: connection lost (${S.lastErrorKind || 'closed'}); REST polling is back to normal while it retries`); S.loggedFailure = true; }
      else if (!S.loggedFailure && S.running) { S.loggedFailure = true; log(`SenseCAP live stream: cannot connect (${S.lastErrorKind || 'unknown'}); trying again with growing pauses, REST polling stays normal`); }
    });
    // the teachers' switch, the quiet clean-up and the bad-message line
    watch = setInterval(() => {
      if (switchedOff()) { if (S.running) { disconnect(); log('SenseCAP live stream: disconnected because a teacher switched SenseCAP off'); } }
      else if (!S.running) { connect(); log('SenseCAP live stream: SenseCAP is switched on again, connecting'); }
      reportBad();
    }, watchMs);
    prune = setInterval(() => {
      const cut = now() - 2 * DAY;
      for (const [eui, dev] of S.byEui) {
        for (const [mid, r] of dev) if (r.ms < cut) dev.delete(mid);
        if (!dev.size) S.byEui.delete(eui);
      }
    }, 600000);
    watch.unref(); prune.unref();
    if (switchedOff()) log('SenseCAP live stream: waiting, SenseCAP is switched off by a teacher');
    else { log(`SenseCAP live stream: connecting to ${cfg.host}:${cfg.port} over TLS`); connect(); }
    return true;
  }
  function stop() {
    clearInterval(watch); clearInterval(prune);
    disconnect();
    S.started = false;
  }

  /* ----- what the ops page shows: state and counts only ----- */
  function status() {
    const t = now();
    let state = 'off';
    if (cfg.ok && !S.started) state = 'connecting';
    else if (cfg.ok) state = switchedOff() ? 'paused' : healthy() ? 'live' : online() ? 'quiet' : (S.lastErrorKind === 'login' ? 'refused' : 'connecting');
    return {
      asked: cfg.asked, ok: cfg.ok, reason: cfg.reason, state, healthy: healthy(), online: online(),
      messages: S.messages, bad: S.bad, ignored: S.ignored, dropped: S.dropped, late: S.late, devices: S.byEui.size, reconnects: S.reconnects,
      lastMessageAgoMs: S.lastMessageAt ? t - S.lastMessageAt : null, lastError: S.lastErrorKind,
      restLatestMs: cfg.ok ? cfg.safetyMs : null, restDevicesMs: cfg.ok ? cfg.devicesMs : null,
    };
  }
  /** One line in both languages for the ops page, or null when the stream was not asked for (nothing changes then). */
  function describe() {
    if (!cfg.asked) return null;
    const s = status();
    const head = ['SenseCAP live stream: ', 'Ζωντανή ροή SenseCAP: '];
    const say = (en, el) => ({ en: head[0] + en, el: head[1] + el });
    if (s.state === 'off') {
      const why = {
        'no-key': ['off, no SenseCAP key is set.', 'ανενεργή, δεν έχει οριστεί κλειδί SenseCAP.'],
        'no-org': ['off, the organisation number is not set.', 'ανενεργή, δεν έχει οριστεί ο αριθμός οργανισμού.'],
        'bad-org': ['off, the organisation number is not valid.', 'ανενεργή, ο αριθμός οργανισμού δεν είναι έγκυρος.'],
        'no-tls-port': ['off, no encrypted (TLS) port is set. SenseCAP has not published one, so nothing is sent.', 'ανενεργή, δεν έχει οριστεί κρυπτογραφημένη θύρα (TLS). Το SenseCAP δεν έχει δημοσιεύσει καμία, οπότε δεν στέλνεται τίποτα.'],
      }[s.reason] || ['off, the settings are not accepted (an unencrypted connection is never used).', 'ανενεργή, οι ρυθμίσεις δεν γίνονται δεκτές (δεν χρησιμοποιείται ποτέ μη κρυπτογραφημένη σύνδεση).'];
      return say(...why);
    }
    const mins = Math.round(cfg.safetyMs / 60000) || 1;
    if (s.state === 'live') {
      const a = s.lastMessageAgoMs == null ? null : ago(s.lastMessageAgoMs);
      return say(`connected, ${s.messages} readings received${a ? ', the last one ' + a.en + ' ago' : ''}. SenseCAP is asked only about every ${mins} min.`,
        `συνδεδεμένη, ${s.messages} μετρήσεις${a ? ', η τελευταία πριν ' + a.el : ''}. Το SenseCAP ρωτιέται μόνο περίπου κάθε ${mins} λεπτά.`);
    }
    if (s.state === 'quiet') {
      const a = ago(s.lastMessageAgoMs == null ? cfg.silentMs : Math.max(s.lastMessageAgoMs, cfg.silentMs));
      return say(`connected but quiet for more than ${a.en}, so SenseCAP is asked every minute as before.`, `συνδεδεμένη αλλά σιωπηλή για πάνω από ${a.el}, οπότε το SenseCAP ρωτιέται κάθε λεπτό όπως πριν.`);
    }
    if (s.state === 'paused') return say('paused because a teacher switched SenseCAP off.', 'σε παύση, επειδή εκπαιδευτικός απενεργοποίησε το SenseCAP.');
    if (s.state === 'refused') return say('the broker refused the login, so SenseCAP is asked every minute as before.', 'ο διακομιστής απέρριψε τη σύνδεση, οπότε το SenseCAP ρωτιέται κάθε λεπτό όπως πριν.');
    return say('not connected right now (trying again), so SenseCAP is asked every minute as before.', 'δεν είναι συνδεδεμένη αυτή τη στιγμή (ξαναπροσπαθεί), οπότε το SenseCAP ρωτιέται κάθε λεπτό όπως πριν.');
  }

  return { asked: cfg.asked, enabled: cfg.ok, reason: cfg.reason, start, stop, overlay, restTtl, serving, healthy, status, describe, handle };
}

module.exports = { createSenseCapStream, readConfig, errorKind };
