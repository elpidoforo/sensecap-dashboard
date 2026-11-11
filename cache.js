'use strict';
/* A small in-memory cache for the server.
 * - Entries expire after the time to live given with each call.
 * - The cache never holds more than `max` keys (and, when `maxBytes` and `sizeOf` are given, never more than that many bytes):
 *   the least recently used entry goes first. Keys that come from a request (hours, days, picture addresses) can therefore
 *   not make the memory grow without limit.
 * - Two callers asking for the same key at the same time share one call, so an empty cache does not hit the sensor API
 *   once per visitor.
 * - A call that fails is not cached. With `staleMs`, when a refresh fails the last good answer is served instead (up to that
 *   age) and is kept for another time to live, so a busy or down upstream is asked once per time to live, not once per visitor.
 */
function createCache({ max = 200, maxBytes = 0, sizeOf = null, staleMs = 0 } = {}) {
  const map = new Map();   // key -> { t, done, size, p }; the Map order is the usage order, oldest first
  let bytes = 0;

  const drop = (key) => {
    const e = map.get(key);
    if (!e) return;
    bytes -= e.size;
    map.delete(key);
  };
  const trim = () => {
    while (map.size > max || (maxBytes && bytes > maxBytes && map.size > 1)) drop(map.keys().next().value);
  };

  function get(key, ttlMs, fn) {
    const hit = map.get(key);
    if (hit && (!hit.done || Date.now() - hit.t < ttlMs)) {
      map.delete(key);   // move to the newest end
      map.set(key, hit);
      return hit.p;
    }
    const old = hit && hit.done && hit.has ? hit : null;   // the last good answer, kept in case the refresh fails
    if (hit) drop(key);
    const e = { t: Date.now(), at: Date.now(), done: false, size: 0, p: null, v: undefined, has: false };
    e.p = (async () => {
      try { return await fn(); } catch (err) {
        if (staleMs && old && Date.now() - old.at < staleMs) { e.at = old.at; return old.v; }
        throw err;
      }
    })();
    map.set(key, e);
    trim();
    e.p.then(
      (v) => {
        if (map.get(key) !== e) return;
        e.done = true;
        e.has = true;
        e.v = v;
        e.t = Date.now();
        if (e.at === undefined) e.at = e.t;
        e.size = sizeOf ? Math.max(0, Number(sizeOf(v)) || 0) : 0;
        bytes += e.size;
        trim();
      },
      () => { if (map.get(key) === e) drop(key); }
    );
    return e.p;
  }

  return { get, clear: () => { map.clear(); bytes = 0; }, get size() { return map.size; }, get bytes() { return bytes; } };
}

module.exports = { createCache };
