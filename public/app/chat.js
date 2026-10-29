'use strict';
/* Group chat (all schools, school, team) with reporting and teacher tools, and the Ask screen for the assistant. */
(function () {
  const { h, api, fmt } = App;

  /* ---------- channel list ---------- */

  const kindDot = (c) => (c.kind === 'school' ? App.schoolDot(c.name) : c.kind === 'team' ? h('span', { class: 'dot', style: 'background:var(--copper)' }) : h('span', { class: 'dot', style: 'background:var(--sea)' }));
  const preview = (m) => (!m ? 'No messages yet' : (m.user.name + ': ' + (m.body || '').replace(/\s+/g, ' ')).slice(0, 80));

  App.route(/^\/chat$/, async (view) => {
    App.setTop({ title: 'Chat', right: null });
    const me = App.state.me;
    const page = h('div', { class: 'page' });
    view.append(page);
    const draw = async () => {
      const r = await api('/app/api/channels');
      App.state.channels = r.channels;
      App.state.unread = r.channels.reduce((n, c) => n + c.unread, 0);
      App.paintBadges();
      const groups = [['Everyone', r.channels.filter((c) => c.kind === 'all')], ['Schools', r.channels.filter((c) => c.kind === 'school')], ['Teams', r.channels.filter((c) => c.kind === 'team')]];
      page.replaceChildren(
        groups.filter((g) => g[1].length).map(([title, list]) => [h('div', { class: 'sechead' }, h('h2', null, title)),
          h('div', { class: 'list chanlist' }, list.map((c) => h('a', { class: 'item', href: '#/chat/' + encodeURIComponent(c.id) }, kindDot(c),
            h('div', { class: 'grow' }, h('b', null, c.name), h('span', null, c.last ? preview(c.last) : c.sub + ' · no messages yet')),
            c.unread ? h('span', { class: 'unread' }, c.unread > 99 ? '99+' : c.unread) : (c.last ? h('span', { class: 'when' }, fmt.clock(c.last.at)) : null))))]),
        me.role === 'student' && !me.team ? h('p', { class: 'muted small' }, 'You are not in a team yet. A teacher adds you to a team, and then its channel shows up here.') : null,
        h('p', { class: 'muted small', style: 'margin-top:14px' }, 'There are no private messages. Everything is shared with a group, and teachers can read it.'));
    };
    await draw();
    let t = null;
    const off = [App.on('message', () => { clearTimeout(t); t = setTimeout(draw, 400); }), App.on('deleted', () => draw())];
    App.cleanup(() => { off.forEach((f) => f()); clearTimeout(t); });
  }, { tab: 'chat' });

  /* ---------- one channel ---------- */

  function actionSheet(m) {
    const me = App.state.me;
    const staff = me.role !== 'student';
    const mine = m.user.id === me.id;
    const canModerate = staff && !mine && (me.role === 'admin' ? m.user.role !== 'admin' : m.user.role === 'student');
    const sh = App.sheet('Message options', h('div', null,
      h('div', { class: 'quote' }, m.body),
      !mine ? h('button', { class: 'opt', onclick: () => { sh.close(); reportSheet(m); } }, 'Report this message') : null,
      staff && (canModerate || mine || me.role === 'admin') ? h('button', { class: 'opt danger', onclick: async () => {
        sh.close();
        if (await App.confirm('Delete this message?', 'Everyone in the channel will see that it was removed.', 'Delete', true)) {
          try { await api(`/app/api/manage/messages/${m.id}/delete`, {}); App.toast('Message removed'); } catch (e) { App.toast(e.message, true); }
        }
      } }, 'Delete message') : null,
      canModerate ? [['1 hour', 60], ['1 day', 1440]].map(([label, min]) => h('button', { class: 'opt danger', onclick: async () => {
        sh.close();
        try { await api(`/app/api/manage/users/${m.user.id}/mute`, { minutes: min, reason: 'A teacher muted you.' }); App.toast(`${m.user.name} is muted for ${label}`); } catch (e) { App.toast(e.message, true); }
      } }, `Mute ${m.user.name} for ${label}`)) : null,
      h('button', { class: 'opt', onclick: () => sh.close() }, 'Close')), { noFocus: true });
  }
  function reportSheet(m) {
    const reasons = App.state.reasons;
    let reason = 'unkind';
    const note = h('textarea', { rows: '2', maxlength: '300', placeholder: 'Add a note for the teacher (optional)', 'aria-label': 'Note' });
    const sel = h('div', { class: 'chips' });
    const paint = () => sel.replaceChildren(Object.keys(reasons).map((k) => h('button', { class: 'chip' + (k === reason ? ' on' : ''), type: 'button', onclick: () => { reason = k; paint(); } }, reasons[k])));
    paint();
    const sh = App.sheet('Report this message', h('div', null, h('div', { class: 'quote' }, m.body), h('p', { class: 'muted small' }, 'A teacher will read the report. The person is not told who reported.'), sel, note,
      h('div', { class: 'actions', style: 'margin-top:12px' }, h('button', { class: 'btn primary', onclick: async () => {
        try { await api(`/app/api/messages/${m.id}/report`, { reason, note: note.value }); sh.close(); App.toast('Thanks. A teacher will look at it.'); } catch (e) { App.toast(e.message, true); }
      } }, 'Send report'), h('button', { class: 'btn', onclick: () => sh.close() }, 'Cancel'))));
  }

  App.route(/^\/chat\/(.+)$/, async (view, [channel]) => {
    const me = App.state.me;
    App.openChannel = channel;
    const first = await api('/app/api/messages?channel=' + encodeURIComponent(channel));
    const meta = first.meta || { name: 'Chat' };
    App.setTop({ title: meta.name, back: '/chat', right: meta.kind === 'team' && me.role === 'student' ? h('button', { class: 'btn small', style: 'background:rgba(255,255,255,.12);color:inherit;border-color:transparent', onclick: showTeam }, 'Team') : meta.kind === 'school' ? App.schoolDot(meta.name) : null });
    const list = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
    const seen = new Set();
    let oldest = null, newest = null, hasMore = first.more;
    const loadMoreBtn = h('button', { class: 'btn small loadmore hidden', onclick: loadOlder }, 'Show earlier messages');

    function rowFor(m, prev) {
      const mine = m.user.id === me.id;
      const gap = prev && prev.user.id === m.user.id && m.at - prev.at < 300000 && fmt.dayKey(prev.at) === fmt.dayKey(m.at);
      const el = h('div', { class: 'msg' + (mine ? ' me' : ''), 'data-id': m.id },
        !gap && !mine ? h('div', { class: 'who' }, App.schoolDot(m.user.school), m.user.name, m.user.school ? h('span', { class: 'muted', style: 'font-weight:400' }, ' · ' + m.user.school) : null, m.user.role !== 'student' ? h('span', { class: 'badge-role' }, m.user.role === 'admin' ? 'Admin' : 'Teacher') : null) : null,
        bubbleFor(m));
      return el;
    }
    function bubbleFor(m) {
      if (m.deleted) return h('div', { class: 'bubble gone' }, 'Message removed');
      return h('div', { class: 'bubble' }, m.body, h('span', { class: 't' }, fmt.clock(m.at)),
        h('button', { class: 'more', 'aria-label': 'Message options', onclick: () => actionSheet(m) }, '⋯'));
    }
    function dayRow(m) { return h('div', { class: 'day' }, fmt.day(m.at)); }
    function append(msgs) {
      const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      for (const m of msgs) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const prev = newest;
        if (!prev || fmt.dayKey(prev.at) !== fmt.dayKey(m.at)) list.append(dayRow(m));
        list.append(rowFor(m, prev));
        newest = m;
        if (!oldest) oldest = m;
      }
      if (near || (msgs.length && msgs[msgs.length - 1].user.id === me.id)) list.scrollTop = list.scrollHeight;
    }
    async function loadOlder() {
      if (!oldest) return;
      const r = await api(`/app/api/messages?channel=${encodeURIComponent(channel)}&before=${oldest.id}`);
      hasMore = r.more;
      const keep = list.scrollHeight;
      const frag = document.createDocumentFragment();
      let prev = null;
      for (const m of r.messages) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        if (!prev || fmt.dayKey(prev.at) !== fmt.dayKey(m.at)) frag.append(dayRow(m));
        frag.append(rowFor(m, prev));
        prev = m;
      }
      if (r.messages.length) oldest = r.messages[0];
      loadMoreBtn.after(frag);
      loadMoreBtn.classList.toggle('hidden', !hasMore);
      list.scrollTop = list.scrollHeight - keep;
    }
    async function showTeam() {
      try {
        const t = await api('/app/api/team');
        App.sheet(t.team ? t.team.name : 'Team', h('div', { class: 'list' }, t.members.map((x) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, x.name), x.role !== 'student' ? h('span', null, 'Teacher') : null)))));
      } catch (e) { App.toast(e.message, true); }
    }

    list.append(loadMoreBtn);
    loadMoreBtn.classList.toggle('hidden', !hasMore);
    if (!App.store('sc_rules_seen')) {
      const rules = h('div', { class: 'rules' }, h('b', null, 'Chat rules'), h('p', { style: 'margin:4px 0 8px' }, 'Be kind. Keep private details private: no phone numbers, e-mails, links or social media. Tap the ⋯ on a message to report it. Teachers can read this chat.'), h('button', { class: 'btn small', onclick: () => { App.store('sc_rules_seen', '1'); rules.remove(); } }, 'Got it'));
      list.append(rules);
    }
    if (!first.messages.length) list.append(h('div', { class: 'empty' }, 'No messages yet. Say hello and share what your sensors found.'));
    append(first.messages);

    const muted = me.muted_until && me.muted_until > Date.now();
    const ta = h('textarea', { rows: '1', maxlength: '800', placeholder: 'Write a message', 'aria-label': 'Message' });
    const send = h('button', { class: 'send', 'aria-label': 'Send message', disabled: true }, App.icon('send'));
    const composer = muted
      ? h('div', { class: 'composer locked' }, `You are muted until ${fmt.full(me.muted_until)}.`)
      : h('form', { class: 'composer', onsubmit: async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text) return;
        send.disabled = true;
        try {
          const r = await api('/app/api/messages', { channel, body: text });
          ta.value = ''; ta.style.height = '';
          list.querySelectorAll('.empty').forEach((x) => x.remove());
          append([r.message]);
        } catch (x) { App.toast(x.message, true); }
        send.disabled = !ta.value.trim();
        ta.focus();
      } }, ta, send);
    ta.addEventListener('input', () => { send.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); composer.requestSubmit(); } });

    view.append(h('div', { class: 'chatwrap' }, list, composer));
    list.scrollTop = list.scrollHeight;

    let markT = null;
    const markRead = () => { clearTimeout(markT); markT = setTimeout(async () => { try { await api('/app/api/channels/read', { channel }); App.refreshCounts(); } catch (e) { /* offline */ } }, 300); };
    markRead();
    const off = [
      App.on('message', (m) => { if (m.channel === channel) { list.querySelectorAll('.empty').forEach((x) => x.remove()); append([m]); markRead(); } }),
      App.on('deleted', (d) => { if (d.channel !== channel) return; const row = list.querySelector(`.msg[data-id="${d.id}"]`); if (row) { const b = row.querySelector('.bubble'); if (b) b.replaceWith(h('div', { class: 'bubble gone' }, 'Message removed')); } }),
      App.on('connected', async () => { if (newest) { try { const r = await api(`/app/api/messages?channel=${encodeURIComponent(channel)}&after=${newest.id}`); append(r.messages); } catch (e) { /* ignore */ } } }),
    ];
    App.cleanup(() => { off.forEach((f) => f()); clearTimeout(markT); });
  }, { tab: 'chat' });

  /* ---------- Ask the assistant ---------- */

  const convo = [];   // kept only in memory, so it is gone when the page is closed
  const SOURCE = { get_vehicles: 'live sensors', get_vehicle_history: 'sensor history', get_vehicle_trip: 'GPS route', get_forecast_model_now: 'weather model', get_met_office_now: 'Met Office stations', get_met_office_history: 'Met Office history', get_met_office_text: 'Met Office pages', search_handbook: 'handbook' };
  const SUGGEST = ['What is my school\'s bus reading right now?', 'Is the air in the vehicles stuffy?', 'How does my vehicle compare with the nearest Met Office station?', 'How do I read CO2 values?', 'What is PM2.5 and why does it matter?', 'Suggest a question my team could investigate'];

  App.route(/^\/ask$/, async (view) => {
    App.setTop({ title: 'Ask the assistant', right: null });
    if (!App.state.bot) {
      view.append(h('div', { class: 'page' }, h('div', { class: 'card' }, h('h2', null, 'The assistant is not switched on yet'),
        h('p', { class: 'muted' }, App.state.me.role === 'admin'
          ? 'Add your Anthropic key as the ANTHROPIC_API_KEY variable on the server. The assistant starts right after the next deploy.'
          : 'Ask your teacher or the project admin to switch it on.'))));
      return;
    }
    const list = h('div', { class: 'msgs ask', role: 'log', 'aria-live': 'polite' });
    const chipBox = h('div', { class: 'chips', style: 'margin:8px 0' });
    const typing = h('div', { class: 'typing hidden' }, h('i'), h('i'), h('i'), h('span', { id: 'typingText' }, 'Thinking'));
    const ta = h('textarea', { rows: '1', maxlength: '600', placeholder: 'Ask about the data, the maps or the science', 'aria-label': 'Question' });
    const send = h('button', { class: 'send', 'aria-label': 'Send question', disabled: true }, App.icon('send'));
    let busy = false;

    const botRow = (m) => {
      const body = h('div', { class: 'bubble' }); body.append(App.md(m.text));
      const rep = m.id ? h('button', { onclick: () => reportAnswer(m) }, 'Report this answer') : null;
      return h('div', { class: 'msg bot' }, h('div', { class: 'who' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, 'AI'), 'Smart City assistant'), body,
        m.tools && m.tools.length ? h('div', { class: 'sources' }, h('span', null, 'Looked at: ' + m.tools.map((t) => SOURCE[t] || t).join(', ')), rep) : (rep ? h('div', { class: 'sources' }, rep) : null));
    };
    const userRow = (m) => h('div', { class: 'msg me' }, h('div', { class: 'bubble' }, m.text));
    const paint = () => {
      list.replaceChildren(
        botRow({ text: 'Hi! I am an AI assistant for the Smart Cities project. I can look up live sensor readings, Met Office stations and history, and explain the science.\n\nI can make mistakes, so check important numbers on the Home screen. Your teachers can read your questions.' }),
        convo.map((m) => (m.role === 'user' ? userRow(m) : m.error ? h('div', { class: 'notice' }, m.text) : botRow(m))),
        typing);
      chipBox.classList.toggle('hidden', convo.length > 0);
      list.scrollTop = list.scrollHeight;
    };
    function reportAnswer(m) {
      let reason = 'inappropriate';
      const sel = h('div', { class: 'chips' });
      const paintR = () => sel.replaceChildren(Object.keys(App.state.reasons).filter((k) => k !== 'unkind').map((k) => h('button', { class: 'chip' + (k === reason ? ' on' : ''), onclick: () => { reason = k; paintR(); } }, k === 'private' ? 'Asked for private details' : App.state.reasons[k])));
      paintR();
      const note = h('textarea', { rows: '2', maxlength: '300', placeholder: 'What was wrong? (optional)' });
      const sh = App.sheet('Report this answer', h('div', null, h('p', { class: 'muted small' }, 'A teacher will read it.'), sel, note, h('div', { class: 'actions', style: 'margin-top:12px' },
        h('button', { class: 'btn primary', onclick: async () => { try { await api(`/app/api/bot/${m.id}/report`, { reason, note: note.value }); sh.close(); App.toast('Thanks. A teacher will look at it.'); } catch (e) { App.toast(e.message, true); } } }, 'Send report'),
        h('button', { class: 'btn', onclick: () => sh.close() }, 'Cancel'))));
    }

    async function ask(text) {
      text = text.trim();
      if (!text || busy) return;
      busy = true; send.disabled = true;
      const history = convo.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, text: m.text }));
      convo.push({ role: 'user', text });
      ta.value = ''; ta.style.height = '';
      paint();
      typing.classList.remove('hidden'); $typing('Thinking');
      list.scrollTop = list.scrollHeight;
      try {
        const r = await fetch('/app/api/bot', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, history }) });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'The assistant could not answer.'); }
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          if (value) buf += dec.decode(value, { stream: true });
          done = d;
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line) continue;
            let ev; try { ev = JSON.parse(line); } catch (x) { continue; }
            if (ev.type === 'tool') $typing(ev.name);
            else if (ev.type === 'answer') convo.push({ role: 'assistant', text: ev.text, id: ev.id, tools: ev.tools });
            else if (ev.type === 'error') convo.push({ role: 'assistant', text: ev.message, error: true });
          }
        }
      } catch (e) { convo.push({ role: 'assistant', text: e.message, error: true }); }
      busy = false; typing.classList.add('hidden'); send.disabled = !ta.value.trim();
      paint();
    }
    function $typing(t) { const el = typing.querySelector('#typingText'); if (el) el.textContent = t; }

    SUGGEST.forEach((s) => chipBox.append(h('button', { class: 'chip', onclick: () => ask(s) }, s)));
    const composer = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); ask(ta.value); } }, ta, send);
    ta.addEventListener('input', () => { send.disabled = busy || !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); composer.requestSubmit(); } });
    view.append(h('div', { class: 'chatwrap ask' }, list, h('div', { style: 'padding:0 12px' }, chipBox), composer));
    paint();
  }, { tab: 'ask' });
})();
