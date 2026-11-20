'use strict';
/* Kleanthis's voice, and the microphone for a spoken question ("Guide me").
 *
 *   speak(text, lang)      text -> audio, through OpenRouter's speech endpoint (POST /api/v1/audio/speech).
 *                          Only the guide's own words are ever sent: never anything a student typed or said.
 *   transcribe(wav, lang)  a short recording -> words, through OpenRouter's transcription endpoint
 *                          (POST /api/v1/audio/transcriptions, JSON with base64 audio). The recording is used for that one
 *                          call and is not kept here: not on disk, not in a log, not in the cache. By default the request
 *                          asks OpenRouter for providers that keep nothing either (provider.zdr); if none can serve the
 *                          model the call fails and the page says the microphone is not available - it does not quietly
 *                          fall back to a provider that keeps recordings.
 *
 * Off unless OPENROUTER_API_KEY is set. The key is never sent to a browser and never written to a log.
 * Settings (all optional):
 *   GUIDE_TTS_MODEL   default google/gemini-3.8-flash-lite-tts   GUIDE_TTS_VOICE  default Charon (others to try by ear: Algenib, Sadaltager, Orus)
 *   GUIDE_TTS_STYLE   the delivery instruction                    GUIDE_TTS_SPEED  unset (some models refuse a speed)
 *   GUIDE_STT_MODEL   default openai/whisper-1                    GUIDE_STT_ZDR    default 1 (0 allows any provider)
 *   OPENROUTER_BASE   default https://openrouter.ai (a test points it at a fake)
 * Spoken lines are cached in memory (same words, same voice -> one call), so the welcome and the tour cost once.
 * No dependencies.
 * createVoice({ apiKey, log }) -> { enabled, speak, transcribe, model } */
const crypto = require('crypto');
const { createCache } = require('./cache');

const STYLE = 'You are Kleanthis, a man of about sixty: a kind, experienced teacher with a deep, warm, mature male voice. Speak to school students calmly and clearly, unhurried, a little slower than normal conversation, with a smile in the voice. Never sound young or excited. Read the text exactly as written.';
const FALLBACK_VOICE = 'Puck';   // the voice known to work; used once if the service refuses the chosen one

// Raw 16-bit mono PCM -> a WAV file a browser can play.
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function createVoice({ apiKey, log = () => {}, env = process.env } = {}) {
  const key = String(apiKey || '').trim();
  const base = String(env.OPENROUTER_BASE || 'https://openrouter.ai').replace(/\/$/, '');
  const ttsModel = env.GUIDE_TTS_MODEL || 'google/gemini-3.8-flash-lite-tts';
  const ttsVoice = env.GUIDE_TTS_VOICE || 'Charon';   // a deeper, older-sounding male voice
  const style = env.GUIDE_TTS_STYLE || STYLE;
  const speed = Number(env.GUIDE_TTS_SPEED) > 0 ? Number(env.GUIDE_TTS_SPEED) : null;
  const sttModel = env.GUIDE_STT_MODEL || 'openai/whisper-1';
  const zdr = env.GUIDE_STT_ZDR !== '0';
  const retryMs = Number(env.GUIDE_TTS_RETRY_MS) >= 0 && env.GUIDE_TTS_RETRY_MS !== undefined && env.GUIDE_TTS_RETRY_MS !== '' ? Number(env.GUIDE_TTS_RETRY_MS) : 700;
  const cache = createCache({ max: 400, maxBytes: 40e6, sizeOf: (v) => v.buf.length });
  const clean = (m) => String(m || '').split(key || '\u0000').join('***').slice(0, 200);

  async function call(pathname, body, timeoutMs) {
    const r = await fetch(base + pathname, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    return r;
  }

  async function speak(text, lang) {
    if (!key) { const e = new Error('voice off'); e.code = 'off'; throw e; }
    const id = crypto.createHash('sha256').update([ttsModel, ttsVoice, lang, text].join('\n')).digest('hex');
    return cache.get(id, 7 * 86400000, async () => {
      const gemini = /gemini/i.test(ttsModel);            // Gemini speech answers with raw PCM only and refuses mp3
      const body = { model: ttsModel, input: text, voice: ttsVoice, instructions: style + (lang === 'el' ? ' The text is in Greek: speak natural Greek.' : ''), response_format: gemini ? 'pcm' : 'mp3' };
      if (speed) body.speed = speed;
      let r = await call('/api/v1/audio/speech', body, 45000);
      for (let n = 0; n < 2 && (r.status === 429 || r.status === 503) ; n++) {   // too busy for a moment (a provider's "slow down"): ask again, so the made voice is kept instead of the browser's. Not for 402: that is empty credits and waiting will not help.
        log('Guide voice: speech service answered ' + r.status + ', trying again');
        await new Promise((ok) => setTimeout(ok, retryMs));
        r = await call('/api/v1/audio/speech', body, 45000);
      }
      if ((r.status === 400 || r.status === 404 || r.status === 422) && body.voice !== FALLBACK_VOICE) {   // the service does not know this voice: say it with the known one rather than fall silent
        log('Guide voice: "' + body.voice + '" was refused (' + r.status + '), using ' + FALLBACK_VOICE);
        r = await call('/api/v1/audio/speech', Object.assign({}, body, { voice: FALLBACK_VOICE }), 45000);
      }
      if (!r.ok) { let m = ''; try { m = JSON.stringify(await r.json()).slice(0, 200); } catch (e) { m = ''; } throw new Error('speech service answered ' + r.status + ' ' + clean(m)); }
      const type = String(r.headers.get('content-type') || '').toLowerCase();
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 200) throw new Error('speech service sent no sound');
      if (/mpeg|mp3/.test(type)) return { type: 'audio/mpeg', buf };
      if (/wav/.test(type)) return { type: 'audio/wav', buf };
      const rate = Number((/rate=(\d{4,6})/.exec(type) || [])[1]) || 24000;   // PCM: 16-bit mono; 24 kHz unless the answer says otherwise
      return { type: 'audio/wav', buf: wav(buf, rate) };
    });
  }

  async function transcribe(b64wav, lang) {
    if (!key) { const e = new Error('voice off'); e.code = 'off'; throw e; }
    const body = { model: sttModel, input_audio: { data: b64wav, format: 'wav' }, language: lang === 'el' ? 'el' : 'en' };
    if (zdr) body.provider = { zdr: true };
    const r = await call('/api/v1/audio/transcriptions', body, 60000);
    if (!r.ok) { let m = ''; try { m = JSON.stringify(await r.json()).slice(0, 200); } catch (e) { m = ''; } throw new Error('transcription service answered ' + r.status + ' ' + clean(m)); }
    const j = await r.json();
    return String((j && j.text) || '').replace(/\s+/g, ' ').trim();
  }

  if (key) log(`Guide voice: on (${ttsModel}, voice ${ttsVoice}; microphone model ${sttModel}${zdr ? ', providers that keep nothing' : ''})`);
  return { enabled: Boolean(key), speak, transcribe, model: ttsModel, clean };
}

module.exports = { createVoice, wav };
