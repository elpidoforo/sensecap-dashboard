'use strict';
/* Which AI service the site talks to, and how a request is addressed to it.
 *
 * The site speaks one format everywhere: Anthropic's Messages API (POST <base>/v1/messages). Two services accept it:
 *   - Anthropic itself (https://api.anthropic.com), key in the x-api-key header;
 *   - OpenRouter's Anthropic-compatible endpoint (https://openrouter.ai/api/v1/messages), key as a bearer token, models named
 *     "anthropic/claude-sonnet-5.5" instead of "claude-sonnet-5-5".
 * Inside the site a model keeps its Anthropic name (the callers know what each model accepts by that name); the name is
 * translated only on the wire, here.
 *
 * Privacy: questions may come from students. Through OpenRouter every request asks for providers that keep nothing
 * (provider.zdr, the same rule as the guide's voice in voice.js). If no such provider can serve the model the request fails;
 * it is never sent to a provider that stores prompts. AI_ZDR=0 lifts this (not for a site with students).
 *
 * pick(env) -> { provider: 'openrouter' | 'anthropic', apiKey, baseUrl, model, zdr, why }
 *   AI_PROVIDER=openrouter | anthropic   says which one. Without it: OpenRouter when OPENROUTER_API_KEY is set and nobody has
 *                                        pointed ANTHROPIC_BASE_URL somewhere on purpose; otherwise Anthropic.
 *   BOT_MODEL          the model, by its Anthropic name (or an OpenRouter name with a slash, sent as it is)
 *   OPENROUTER_BASE    default https://openrouter.ai (a test points it at a fake)
 * headers(apiKey, base) and wire(body, base) are used by every caller right where the request is sent.
 * No key is ever logged or returned by this file. */
const state = { bases: new Set(), zdr: true };
const clean = (u) => String(u || '').replace(/\/+$/, '');
const isOpenRouterHost = (base) => { try { return /(^|\.)openrouter\.ai$/i.test(new URL(base).hostname); } catch (e) { return false; } };
const viaOpenRouter = (base) => { const b = clean(base); return !!b && (state.bases.has(b) || isOpenRouterHost(b)); };

// "claude-sonnet-5-5" -> "anthropic/claude-sonnet-5.5"; a dated name keeps its date; a name with a slash is sent as it is
function slug(model) {
  const m = String(model || '');
  if (!m || m.includes('/')) return m;
  const hit = /^(claude-[a-z]+)-(\d+)-(\d{1,2})(-\d{8})?$/.exec(m);
  if (hit) return 'anthropic/' + hit[1] + '-' + hit[2] + '.' + hit[3] + (hit[4] || '');
  return /^claude-/.test(m) ? 'anthropic/' + m : m;
}

function pick(env) {
  env = env || {};
  const want = String(env.AI_PROVIDER || '').toLowerCase().trim();
  const orKey = String(env.OPENROUTER_API_KEY || ''), anKey = String(env.ANTHROPIC_API_KEY || '');
  state.zdr = env.AI_ZDR !== '0';
  let useOr, why;
  if (want === 'openrouter') { useOr = true; why = 'AI_PROVIDER says openrouter'; }
  else if (want === 'anthropic') { useOr = false; why = 'AI_PROVIDER says anthropic'; }
  else if (orKey && !env.ANTHROPIC_BASE_URL) { useOr = true; why = 'OPENROUTER_API_KEY is set'; }
  else { useOr = false; why = orKey ? 'ANTHROPIC_BASE_URL is set' : 'no OPENROUTER_API_KEY'; }
  if (useOr) { const baseUrl = clean(env.OPENROUTER_BASE || 'https://openrouter.ai') + '/api'; state.bases.add(baseUrl); return { provider: 'openrouter', apiKey: orKey, baseUrl, model: env.BOT_MODEL || undefined, zdr: state.zdr, why }; }
  return { provider: 'anthropic', apiKey: anKey, baseUrl: env.ANTHROPIC_BASE_URL || undefined, model: env.BOT_MODEL || undefined, zdr: false, why };
}

function headers(apiKey, base) {
  if (viaOpenRouter(base)) return { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey, 'anthropic-version': '2023-06-01', 'x-title': 'Kleanthis' };
  return { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
}

// the body as it goes on the wire: for OpenRouter the model gets its OpenRouter name and the keep-nothing rule is added
function wire(body, base) {
  if (!viaOpenRouter(base) || !body || typeof body !== 'object') return body;
  const out = { ...body, model: slug(body.model) };
  if (state.zdr) out.provider = { ...(body.provider || {}), zdr: true };
  return out;
}

// a sentence for the start-up log (never the key)
function describe(p) { return p.provider === 'openrouter' ? 'through OpenRouter' + (p.zdr ? ', providers that keep nothing' : ', any provider') + ' (' + p.why + ')' : 'through Anthropic (' + p.why + ')'; }

module.exports = { pick, headers, wire, slug, viaOpenRouter, describe };
