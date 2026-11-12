'use strict';
/* mqtt.js: a small MQTT 3.1.1 client on node:tls. No dependencies, no plain TCP.
 *
 * It exists for sensecap_stream.js: Seeed's OpenStream broker pushes every SenseCAP reading, so the dashboard can listen
 * instead of asking the REST API about 17 questions per refresh. The login to that broker is our SenseCAP API key, so this
 * client keeps one rule above all others:
 *
 *   The user name and the password are written to a socket only after the TLS handshake has finished and the server
 *   certificate has been verified (host name included). There is no option for a plain connection and no option to skip
 *   the check. If TLS cannot be set up, the broker never sees a single MQTT byte; the only thing that leaves the machine is
 *   the TLS hello of the failed handshake. Every write goes through _write(), which looks at the socket itself
 *   (encrypted and authorized) and refuses otherwise.
 *
 * What it speaks (OASIS MQTT 3.1.1): CONNECT, CONNACK, SUBSCRIBE, SUBACK, PUBLISH (QoS 0 and 1, PUBACK both ways), PINGREQ,
 * PINGRESP, DISCONNECT. Clean session only; no will, no retained publishing, no QoS 2, no UNSUBSCRIBE, no MQTT 5.
 *
 * Defences against a broker (or something in the middle) that misbehaves: the 4-byte remaining-length is checked strictly,
 * a packet over `maxPacket` bytes is refused as soon as its header is read (it is never buffered), unknown or unexpected
 * packet types, bad flags, bad UTF-8, wild-card topic names, packet id 0, QoS 3 and a SUBACK that does not match the request
 * all close the connection. The client then reconnects with exponential back-off and jitter. A keep-alive PINGREQ is sent
 * when nothing was sent for 3/4 of the keep-alive time; if nothing at all arrives within one keep-alive time after it, the
 * connection is dropped and re-opened.
 *
 * The password never appears in an error, an event, a log line or util.inspect output (it lives in a private field).
 *
 * Events:  connect({sessionPresent})  message(topic, payload:Buffer, {qos, retain, dup})  subscribed(filter, qos)
 *          subscribe-failed(filter)  reconnect({attempt, delayMs})  close({wasOnline, error})  error(err)
 */
const tls = require('node:tls');
const net = require('node:net');   // only net.isIP, to decide about SNI
const util = require('node:util');
const { EventEmitter } = require('node:events');

const MAX_REMAINING = 268435455;   // the largest value four length bytes can hold
const T = { CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4, SUBSCRIBE: 8, SUBACK: 9, PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14 };
const FROM_SERVER = new Set([T.CONNACK, T.PUBLISH, T.PUBACK, T.SUBACK, T.PINGRESP]);   // everything else is a protocol error
const CONNACK_TEXT = {
  1: 'the broker does not speak MQTT 3.1.1', 2: 'the broker refused the client id', 3: 'the broker is unavailable',
  4: 'the broker refused the user name or password', 5: 'the broker says this login is not authorised',
};
const PINGREQ = Buffer.from([T.PINGREQ << 4, 0]);
const DISCONNECT = Buffer.from([T.DISCONNECT << 4, 0]);
const EMPTY = Buffer.alloc(0);
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

class MqttError extends Error {
  constructor(message, code) { super(message); this.name = 'MqttError'; this.code = code || 'EMQTT'; }
}
const proto = (m) => new MqttError('MQTT protocol error: ' + m, 'EPROTO');

/* ---------- encoding ---------- */

function utf8(s, what) {
  if (typeof s !== 'string') throw new MqttError(`${what} must be a string`, 'EARG');
  if (s.includes('\u0000')) throw new MqttError(`${what} must not contain a NUL character`, 'EARG');
  const b = Buffer.from(s, 'utf8');
  if (b.length > 65535) throw new MqttError(`${what} is longer than 65535 bytes`, 'EARG');
  const out = Buffer.allocUnsafe(2 + b.length);
  out.writeUInt16BE(b.length, 0);
  b.copy(out, 2);
  return out;
}
function lengthBytes(n) {
  if (!Number.isInteger(n) || n < 0 || n > MAX_REMAINING) throw new MqttError('packet is too large', 'ESIZE');
  const out = [];
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0);
  return Buffer.from(out);
}
function packet(type, flags, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([(type << 4) | flags]), lengthBytes(body.length), body]);
}
function encodeConnect({ clientId, username, password, keepAlive = 60, clean = true }) {
  let flags = clean ? 0x02 : 0;
  const tail = [utf8(clientId, 'client id')];
  if (username != null) {
    flags |= 0x80;
    tail.push(utf8(username, 'user name'));
    if (password != null) {
      flags |= 0x40;
      const p = Buffer.from(String(password), 'utf8');
      if (p.length > 65535) throw new MqttError('password is longer than 65535 bytes', 'EARG');
      const len = Buffer.allocUnsafe(2); len.writeUInt16BE(p.length, 0);
      tail.push(len, p);
    }
  }
  return packet(T.CONNECT, 0, utf8('MQTT', 'protocol name'), Buffer.from([4, flags, keepAlive >> 8, keepAlive & 255]), ...tail);
}
function checkFilter(f) {
  if (typeof f !== 'string' || !f.length || Buffer.byteLength(f) > 1024 || f.includes('\u0000')) throw new MqttError('bad topic filter', 'EARG');
  const parts = f.split('/');
  parts.forEach((p, i) => {
    if (p.includes('#') && (p !== '#' || i !== parts.length - 1)) throw new MqttError('bad topic filter: # must be the whole last level', 'EARG');
    if (p.includes('+') && p !== '+') throw new MqttError('bad topic filter: + must be a whole level', 'EARG');
  });
  return f;
}
function encodeSubscribe(id, filters) {   // filters: [{ filter, qos }]
  return packet(T.SUBSCRIBE, 2, Buffer.from([id >> 8, id & 255]), ...filters.map((x) => Buffer.concat([utf8(checkFilter(x.filter), 'topic filter'), Buffer.from([x.qos])])));
}
function encodePublish(topic, payload, { qos = 0, retain = false, dup = false, id = 0 } = {}) {
  if (typeof topic !== 'string' || !topic.length || /[+#]/.test(topic)) throw new MqttError('bad topic name', 'EARG');
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload == null ? '' : String(payload), 'utf8');
  const head = [utf8(topic, 'topic')];
  if (qos > 0) head.push(Buffer.from([id >> 8, id & 255]));
  return packet(T.PUBLISH, (dup ? 8 : 0) | (qos << 1) | (retain ? 1 : 0), ...head, data);
}
const encodePuback = (id) => Buffer.from([T.PUBACK << 4, 2, id >> 8, id & 255]);

/* ---------- decoding ---------- */

function decode(type, flags, body) {
  switch (type) {
    case T.CONNACK:
      if (flags !== 0 || body.length !== 2 || (body[0] & 0xfe) || body[1] > 5) throw proto('bad CONNACK');
      return { type: 'connack', sessionPresent: Boolean(body[0] & 1), code: body[1] };
    case T.PUBLISH: {
      const qos = (flags >> 1) & 3, dup = Boolean(flags & 8), retain = Boolean(flags & 1);
      if (qos === 3) throw proto('PUBLISH with QoS 3');
      if (qos === 0 && dup) throw proto('PUBLISH with QoS 0 and DUP set');
      if (body.length < 2) throw proto('PUBLISH too short');
      const tl = body.readUInt16BE(0);
      let pos = 2 + tl;
      if (tl === 0 || pos > body.length) throw proto('PUBLISH topic does not fit');
      let topic;
      try { topic = strictUtf8.decode(body.subarray(2, pos)); } catch { throw proto('PUBLISH topic is not valid UTF-8'); }
      if (/[\u0000+#]/.test(topic)) throw proto('PUBLISH topic name has a wild card or NUL');
      let id = 0;
      if (qos > 0) {
        if (pos + 2 > body.length) throw proto('PUBLISH has no packet id');
        id = body.readUInt16BE(pos); pos += 2;
        if (id === 0) throw proto('PUBLISH with packet id 0');
      }
      return { type: 'publish', topic, payload: Buffer.from(body.subarray(pos)), qos, retain, dup, id };   // a copy, so a big socket chunk is not kept alive
    }
    case T.PUBACK: {
      if (flags !== 0 || body.length !== 2) throw proto('bad PUBACK');
      const id = body.readUInt16BE(0);
      if (id === 0) throw proto('PUBACK with packet id 0');
      return { type: 'puback', id };
    }
    case T.SUBACK: {
      if (flags !== 0 || body.length < 3) throw proto('bad SUBACK');
      const id = body.readUInt16BE(0);
      if (id === 0) throw proto('SUBACK with packet id 0');
      const granted = [...body.subarray(2)];
      if (granted.some((g) => g !== 0 && g !== 1 && g !== 2 && g !== 0x80)) throw proto('SUBACK with an unknown return code');
      return { type: 'suback', id, granted };
    }
    case T.PINGRESP:
      if (flags !== 0 || body.length !== 0) throw proto('bad PINGRESP');
      return { type: 'pingresp' };
    default:
      throw proto('unexpected packet type ' + type);
  }
}

/* Cuts a byte stream into packets. push() returns the decoded packets and throws on anything wrong; after a throw the
 * parser is finished and the connection must be closed. */
class Parser {
  constructor({ maxPacket = 65536 } = {}) { this.maxPacket = maxPacket; this.buf = EMPTY; }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out = [];
    let pos = 0;
    while (this.buf.length - pos >= 2) {
      const b0 = this.buf[pos], type = b0 >> 4, flags = b0 & 15;
      if (!FROM_SERVER.has(type)) throw proto('unexpected packet type ' + type);   // refused before any length is believed
      let len = 0, mult = 1, i = 1, complete = false;
      while (i <= 4 && pos + i < this.buf.length) {
        const d = this.buf[pos + i];
        len += (d & 127) * mult;
        i++;
        if (!(d & 128)) { complete = true; break; }
        mult *= 128;
      }
      if (!complete) {
        if (i > 4) throw proto('remaining length is longer than 4 bytes');
        break;   // the length itself is not complete yet
      }
      if (len > this.maxPacket) throw new MqttError(`packet of ${len} bytes is over the limit of ${this.maxPacket}`, 'ESIZE');   // before the body is waited for
      if (this.buf.length - pos < i + len) break;   // the body is not complete yet
      out.push(decode(type, flags, this.buf.subarray(pos + i, pos + i + len)));
      pos += i + len;
    }
    this.buf = pos >= this.buf.length ? EMPTY : Buffer.from(this.buf.subarray(pos));
    return out;
  }
}

/* ---------- the client ---------- */

const int = (v, name, min, max, dflt) => {
  if (v === undefined) return dflt;
  if (!Number.isInteger(v) || v < min || v > max) throw new TypeError(`${name} must be a whole number from ${min} to ${max}`);
  return v;
};

class MqttClient extends EventEmitter {
  #username; #password;
  constructor(opts = {}) {
    super();
    if (typeof opts.host !== 'string' || !opts.host.trim()) throw new TypeError('host is required');
    if ('tls' in opts && opts.tls !== true) throw new TypeError('this client is TLS only: a plain connection is not available');
    if (opts.rejectUnauthorized !== undefined) throw new TypeError('the certificate check cannot be switched off');
    if ((opts.password != null) && opts.username == null) throw new TypeError('a password needs a user name');
    this.host = opts.host.trim();
    this.port = int(opts.port, 'port', 1, 65535);
    if (this.port === undefined) throw new TypeError('port is required');
    this.clientId = typeof opts.clientId === 'string' && opts.clientId ? opts.clientId : 'client-' + Math.random().toString(36).slice(2, 10);
    utf8(this.clientId, 'client id');
    this.#username = opts.username == null ? null : String(opts.username);
    this.#password = opts.password == null ? null : String(opts.password);
    if (this.#username != null) utf8(this.#username, 'user name');
    this.ca = opts.ca;                                              // an extra trust root, for tests or a private broker
    this.keepAlive = int(opts.keepAlive, 'keepAlive', 0, 65535, 60);   // seconds, 0 = off
    this.maxPacket = int(opts.maxPacket, 'maxPacket', 16, MAX_REMAINING, 65536);
    this.connectTimeoutMs = int(opts.connectTimeoutMs, 'connectTimeoutMs', 100, 120000, 15000);
    this.maxInflight = int(opts.maxInflight, 'maxInflight', 1, 1000, 32);
    const r = opts.reconnect || {};
    this.reconnectOpts = {
      minMs: int(r.minMs, 'reconnect.minMs', 10, 3600000, 1000), maxMs: int(r.maxMs, 'reconnect.maxMs', 10, 86400000, 300000),
      factor: r.factor === undefined ? 2 : Number(r.factor), jitter: r.jitter === undefined ? 0.5 : Number(r.jitter),
      authMinMs: int(r.authMinMs, 'reconnect.authMinMs', 0, 86400000, 600000),   // a refused login is retried slowly
      stableMs: int(r.stableMs, 'reconnect.stableMs', 0, 3600000, 30000),         // how long a connection must last to reset the back-off
    };
    if (!(this.reconnectOpts.factor >= 1) || !(this.reconnectOpts.jitter >= 0 && this.reconnectOpts.jitter <= 1)) throw new TypeError('bad reconnect options');
    this._rand = typeof opts.random === 'function' ? opts.random : Math.random;
    this.subs = new Map();            // filter -> requested qos, sent again after every reconnect
    this.state = 'idle';              // idle | connecting | online | waiting | stopped
    this.attempt = 0;
    this._wanted = false;
    this._sock = null; this._parser = null; this._timers = {};
    this._acks = new Map();           // packet id -> { resolve, reject, timer } for QoS 1 publishes
    this._pendingSubs = new Map();    // packet id -> { filters, timer } for each SUBSCRIBE that waits for its SUBACK
    this._nextId = 0; this._lastSent = 0; this._pingAt = 0; this._onlineAt = 0; this._authRefused = false; this._lastError = null;
  }

  /* The password and user name stay out of console.log(client) and JSON.stringify(client). */
  [util.inspect.custom]() { return `MqttClient<${this.host}:${this.port} ${this.state}>`; }
  toJSON() { return { host: this.host, port: this.port, state: this.state }; }

  get online() { return this.state === 'online'; }

  /** Registers a topic filter. It is sent now if the client is online, and again after every reconnect. */
  subscribe(filter, qos = 0) {
    checkFilter(filter);
    if (qos !== 0 && qos !== 1) throw new TypeError('qos must be 0 or 1');
    this.subs.set(filter, qos);
    if (this.online) this._sendSubscribe();
  }

  start() {
    this._wanted = true;
    if (this.state === 'idle' || this.state === 'stopped') { this.attempt = 0; this._open(); }
  }

  /** Says goodbye (DISCONNECT) when online and does not reconnect. */
  stop() {
    this._wanted = false;
    this._clear('retry');
    const s = this._sock;
    if (!s) { this.state = 'stopped'; return; }
    this.state = 'stopped';
    try { if (this._secure(s)) { s.write(DISCONNECT); } } catch { /* closing anyway */ }
    s.end();
    this._timers.hardClose = setTimeout(() => s.destroy(), 500);
    this._timers.hardClose.unref();
  }

  /** QoS 0 resolves when written, QoS 1 when the PUBACK arrives. Rejects when not online, on timeout or on close. */
  publish(topic, payload, { qos = 0, retain = false } = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (qos !== 0 && qos !== 1) throw new MqttError('qos must be 0 or 1', 'EARG');
        if (!this.online) throw new MqttError('not connected', 'ENOTCONN');
        if (qos === 0) { this._write(encodePublish(topic, payload, { qos, retain })); return resolve(); }
        if (this._acks.size >= this.maxInflight) throw new MqttError('too many publishes wait for an answer', 'EBUSY');
        const id = this._newId();
        const buf = encodePublish(topic, payload, { qos, retain, id });
        const timer = setTimeout(() => { this._acks.delete(id); reject(new MqttError('no PUBACK in time', 'ETIMEDOUT')); }, this.connectTimeoutMs);
        this._acks.set(id, { resolve, reject, timer });
        this._write(buf);
      } catch (e) { reject(e); }
    });
  }

  /* ----- internals ----- */

  _emit(event, ...args) {
    if (event === 'error' && !this.listenerCount('error')) return;   // an unhandled 'error' event would throw
    try { this.emit(event, ...args); } catch (e) { if (event !== 'error') this._emit('error', e); }
  }
  _clear(...names) { for (const n of names) { clearTimeout(this._timers[n]); clearInterval(this._timers[n]); delete this._timers[n]; } }
  _secure(s) { return Boolean(s && !s.destroyed && s.encrypted === true && s.authorized === true); }
  _newId() {
    for (let n = 0; n < 65535; n++) {
      this._nextId = (this._nextId % 65535) + 1;
      if (!this._acks.has(this._nextId) && !this._pendingSubs.has(this._nextId)) return this._nextId;
    }
    throw new MqttError('no free packet id', 'EBUSY');
  }

  /* The only place that writes to the socket. */
  _write(buf) {
    const s = this._sock;
    if (!this._secure(s)) throw new MqttError('refusing to write: the TLS connection is not verified', 'ESECURE');
    this._lastSent = Date.now();
    s.write(buf);
  }

  _open() {
    if (!this._wanted) return;
    this.state = 'connecting';
    this._parser = new Parser({ maxPacket: this.maxPacket });
    this._pingAt = 0; this._authRefused = false; this._lastError = null;
    let sock;
    try {
      sock = tls.connect({
        host: this.host, port: this.port, servername: net.isIP(this.host) ? undefined : this.host,
        ca: this.ca, minVersion: 'TLSv1.2', rejectUnauthorized: true,
      });
    } catch (e) {
      this._lastError = e;
      this._emit('error', e);
      this.state = 'waiting';
      return this._schedule(false);
    }
    this._sock = sock;
    sock.setNoDelay(true);
    this._timers.connect = setTimeout(() => this._fail(new MqttError('connection timed out', 'ETIMEDOUT')), this.connectTimeoutMs);
    sock.once('secureConnect', () => {
      if (sock !== this._sock) return;
      if (!this._secure(sock)) return this._fail(new MqttError('the server certificate was not accepted', 'ESECURE'));
      try { this._write(encodeConnect({ clientId: this.clientId, username: this.#username, password: this.#password, keepAlive: this.keepAlive })); }
      catch (e) { this._fail(e); }
    });
    sock.on('data', (chunk) => { if (sock === this._sock) this._onData(chunk); });
    sock.on('error', (e) => { if (sock === this._sock) { this._lastError = e; this._emit('error', e); } });   // 'close' follows
    sock.on('close', () => { if (sock === this._sock) this._onClose(); });
  }

  _fail(err) {
    this._lastError = err;
    this._emit('error', err);
    if (this._sock) this._sock.destroy();
  }

  _onData(chunk) {
    if (this.state === 'stopped') return;   // stop() was called: whatever is still arriving is of no interest
    let packets;
    try { packets = this._parser.push(chunk); } catch (e) { return this._fail(e); }
    for (const p of packets) {
      this._pingAt = 0;   // anything from the broker shows that it is alive
      try { this._onPacket(p); } catch (e) { return this._fail(e); }
      if (!this._sock || this._sock.destroyed) return;
    }
  }

  _onPacket(p) {
    if (this.state === 'connecting') {
      if (p.type !== 'connack') throw proto('the first packet from the broker was not CONNACK');
      if (p.code !== 0) {
        this._authRefused = p.code === 4 || p.code === 5;
        throw new MqttError(`MQTT connection refused (code ${p.code}): ${CONNACK_TEXT[p.code] || 'unknown reason'}`, 'ECONNACK' + p.code);
      }
      this._clear('connect');
      this.state = 'online';
      this._onlineAt = Date.now();
      this._startKeepAlive();
      this._emit('connect', { sessionPresent: p.sessionPresent });
      if (this.subs.size) this._sendSubscribe();
      return;
    }
    switch (p.type) {
      case 'connack': throw proto('a second CONNACK');
      case 'publish':
        this._emit('message', p.topic, p.payload, { qos: p.qos, retain: p.retain, dup: p.dup });
        if (p.qos === 1) this._write(encodePuback(p.id));
        return;
      case 'puback': {
        const a = this._acks.get(p.id);
        if (!a) return;   // a late answer to something that timed out: ignore
        clearTimeout(a.timer); this._acks.delete(p.id); a.resolve();
        return;
      }
      case 'suback': {
        const s = this._pendingSubs.get(p.id);
        if (!s) throw proto('SUBACK for a request that was not made');
        if (p.granted.length !== s.filters.length) throw proto('SUBACK does not match the SUBSCRIBE');
        clearTimeout(s.timer); this._pendingSubs.delete(p.id);
        s.filters.forEach((f, i) => this._emit(p.granted[i] === 0x80 ? 'subscribe-failed' : 'subscribed', f.filter, p.granted[i]));
        return;
      }
      case 'pingresp': return;
      default: throw proto('unexpected ' + p.type);
    }
  }

  _sendSubscribe() {
    const filters = [...this.subs].map(([filter, qos]) => ({ filter, qos }));
    const id = this._newId();
    this._write(encodeSubscribe(id, filters));
    this._pendingSubs.set(id, { filters, timer: setTimeout(() => this._fail(new MqttError('no SUBACK in time', 'ETIMEDOUT')), this.connectTimeoutMs) });
  }

  _startKeepAlive() {
    const k = this.keepAlive * 1000;
    if (!k) return;
    this._lastSent = Date.now();
    this._timers.keep = setInterval(() => {
      if (this.state !== 'online') return;
      const now = Date.now();
      if (this._pingAt) {
        if (now - this._pingAt >= k) this._fail(new MqttError('keep-alive timeout: the broker did not answer', 'ETIMEDOUT'));
        return;
      }
      if (now - this._lastSent >= k * 0.75) {
        try { this._write(PINGREQ); this._pingAt = now; } catch (e) { this._fail(e); }
      }
    }, Math.max(50, Math.floor(k / 4)));
  }

  _onClose() {
    const wasOnline = this.state === 'online';
    const stable = wasOnline && Date.now() - this._onlineAt >= this.reconnectOpts.stableMs;
    this._clear('connect', 'keep', 'hardClose');
    for (const s of this._pendingSubs.values()) clearTimeout(s.timer);
    this._pendingSubs.clear();
    for (const [id, a] of this._acks) { clearTimeout(a.timer); a.reject(new MqttError('connection closed', 'ECLOSED')); this._acks.delete(id); }
    this._sock = null; this._parser = null;
    this._emit('close', { wasOnline, error: this._lastError });
    if (!this._wanted) { this.state = 'stopped'; return; }
    this.state = 'waiting';
    this._schedule(stable);
  }

  _schedule(stable) {
    if (stable) this.attempt = 0;
    const o = this.reconnectOpts;
    let base = Math.min(o.maxMs, o.minMs * o.factor ** this.attempt);
    if (this._authRefused) base = Math.max(base, o.authMinMs);
    const delayMs = Math.max(1, Math.round(base * (1 - o.jitter * this._rand())));   // between base * (1 - jitter) and base
    this.attempt++;
    this._emit('reconnect', { attempt: this.attempt, delayMs });
    this._timers.retry = setTimeout(() => { delete this._timers.retry; this._open(); }, delayMs);
  }
}

const createClient = (opts) => new MqttClient(opts);

module.exports = { createClient, MqttClient, MqttError, Parser, encodeConnect, encodeSubscribe, encodePublish, encodePuback, lengthBytes, checkFilter, T };
