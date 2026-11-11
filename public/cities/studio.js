(function () {
  'use strict';
  var A = window.AISC;
  if (!A) return;
  var esc = A.esc, t = A.t, $ = function (id) { return document.getElementById(id); };

  Object.assign(A.T.en, {
    bs_title: 'Build studio', bs_sub: 'Describe an idea. Claude builds it with you, and you see it on the right.', bs_signin: 'Join or sign in to the student app first, then come back here.', bs_join: 'Join', bs_signin_btn: 'Sign in',
    bs_off: 'Claude is not switched on yet. Ask your teacher or admin to set the ANTHROPIC_API_KEY on the server.', bs_ph: 'What do you want to build? For example: compare heat between my school and Lefkosia', bs_send: 'Send', bs_working: 'Claude is working…',
    bs_new: 'New project', bs_mine: 'My projects', bs_submit: 'Send to teacher', bs_sent: 'Sent. A teacher will review it.', bs_status: 'Status', bs_empty: 'Your tool will appear here.', bs_ai: 'Claude is an AI and can make mistakes. Check the numbers. Never share personal details.',
    bs_s_draft: 'draft', bs_s_pending: 'waiting for a teacher', bs_s_approved: 'approved', bs_s_rejected: 'needs changes', bs_err: 'Something went wrong. Try again.',
    st_none: 'No approved tools yet. Be the first: build one in the Build studio.', st_by: 'by', st_review: 'To review', st_approve: 'Approve', st_reject: 'Ask for changes', st_open: 'Open', st_back: 'All tools', st_mcp_h: 'Connect Claude Code or claude.ai', st_mcp: 'Make a personal token in the student app (Me), then add the /mcp address as a connector. Your projects arrive here as drafts.'
  });
  Object.assign(A.T.el, {
    bs_title: 'Build studio', bs_sub: 'Περιέγραψε μια ιδέα. Το Claude τη χτίζει μαζί σου και τη βλέπεις δεξιά.', bs_signin: 'Πρώτα κάνε εγγραφή ή σύνδεση στην εφαρμογή μαθητών και μετά γύρνα εδώ.', bs_join: 'Εγγραφή', bs_signin_btn: 'Σύνδεση',
    bs_off: 'Το Claude δεν έχει ενεργοποιηθεί ακόμη. Ζήτα από τον εκπαιδευτικό ή τον διαχειριστή να ορίσει το ANTHROPIC_API_KEY στον διακομιστή.', bs_ph: 'Τι θέλεις να φτιάξεις; Για παράδειγμα: σύγκριση θερμότητας μεταξύ του σχολείου μου και της Λευκωσίας', bs_send: 'Αποστολή', bs_working: 'Το Claude δουλεύει…',
    bs_new: 'Νέο έργο', bs_mine: 'Τα έργα μου', bs_submit: 'Αποστολή στον εκπαιδευτικό', bs_sent: 'Στάλθηκε. Ένας εκπαιδευτικός θα το ελέγξει.', bs_status: 'Κατάσταση', bs_empty: 'Το εργαλείο σου θα εμφανιστεί εδώ.', bs_ai: 'Το Claude είναι τεχνητή νοημοσύνη και μπορεί να κάνει λάθη. Έλεγξε τους αριθμούς. Μην μοιράζεσαι προσωπικά στοιχεία.',
    bs_s_draft: 'πρόχειρο', bs_s_pending: 'περιμένει εκπαιδευτικό', bs_s_approved: 'εγκεκριμένο', bs_s_rejected: 'θέλει αλλαγές', bs_err: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
    st_none: 'Δεν υπάρχουν ακόμη εγκεκριμένα εργαλεία. Γίνε ο πρώτος: φτιάξε ένα στο Build studio.', st_by: 'από', st_review: 'Προς έλεγχο', st_approve: 'Έγκριση', st_reject: 'Ζήτα αλλαγές', st_open: 'Άνοιγμα', st_back: 'Όλα τα εργαλεία', st_mcp_h: 'Σύνδεσε Claude Code ή claude.ai', st_mcp: 'Φτιάξε προσωπικό διακριτικό στην εφαρμογή μαθητών (Εγώ) και πρόσθεσε τη διεύθυνση /mcp ως σύνδεση. Τα έργα σου έρχονται εδώ ως πρόχειρα.'
  });

  function j(url, opt) {
    return fetch(url, opt).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) { var e = new Error(b.error || 'error'); e.status = r.status; throw e; } return b; }); });
  }
  function post(url, body) { return j(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); }
  function frame(id) { return '<iframe class="proj" title="Student tool" sandbox="allow-scripts" src="/studio/p/' + id + '?v=' + Date.now() + '"></iframe>'; }

  /* The data bridge: a project page asks, we answer with the delayed, grouped overview. Nothing else is shared. */
  var cache = null, cacheAt = 0;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'cities-get') return;
    var ok = false;
    document.querySelectorAll('iframe.proj').forEach(function (f) { if (f.contentWindow === e.source) ok = true; });
    if (!ok) return;
    var reply = function (o) { o.type = 'cities-result'; o.id = d.id; e.source.postMessage(o, '*'); };
    if (d.what !== 'overview') return reply({ error: 'Unknown data request.' });
    if (cache && Date.now() - cacheAt < 60000) return reply({ data: cache });
    j('/cities/api/overview').then(function (o) { cache = o; cacheAt = Date.now(); reply({ data: o }); }).catch(function () { reply({ error: 'Could not load the data.' }); });
  });

  function loadTools() {
    return j('/studio/api/projects?scope=gallery').then(function (r) { A.tools = r.projects || []; A.nav(); return A.tools; }).catch(function () { return []; });
  }
  loadTools();

  /* ---------- Build studio: chat on the left, live page on the right ---------- */
  A.PAGES.build = function () {
    return '<h1>' + esc(t('bs_title')) + '</h1><p style="max-width:62ch;color:var(--mute)">' + esc(t('bs_sub')) + '</p><div id="bsbox"></div>';
  };
  A.AFTER.build = function (m) {
    var box = $('bsbox');
    j('/studio/api/status').then(function (st) {
      if (!st.user) {
        box.innerHTML = '<div class="card"><p>' + esc(t('bs_signin')) + '</p><a class="btn" href="/app/#/join">' + esc(t('bs_join')) + '</a> <a class="btn ghost" href="/app/#/signin">' + esc(t('bs_signin_btn')) + '</a></div>';
        return;
      }
      var msgs = [], project = null, busy = false, list = [];
      box.innerHTML = (st.configured ? '' : '<div class="demo">' + esc(t('bs_off')) + '</div>') +
        '<div class="ws"><section class="chat" aria-label="Chat"><div id="msgs" class="msgs" aria-live="polite"></div>' +
        '<form id="cf" class="cf"><textarea id="ci" rows="3" maxlength="3000" placeholder="' + esc(t('bs_ph')) + '"></textarea><button class="btn" id="cs">' + esc(t('bs_send')) + '</button></form>' +
        '<p class="note">' + esc(t('bs_ai')) + '</p></section>' +
        '<section class="pv"><div class="pvbar"><select id="pl" aria-label="' + esc(t('bs_mine')) + '"></select><span id="pst" class="badge b-soon"></span><button class="btn ghost" id="psub" type="button">' + esc(t('bs_submit')) + '</button></div><div id="pf" class="pf"><p class="note" style="padding:18px">' + esc(t('bs_empty')) + '</p></div></section></div>';
      var $m = $('msgs'), $i = $('ci');
      function line(role, text, cls) { var d = document.createElement('div'); d.className = 'm ' + role + (cls ? ' ' + cls : ''); d.textContent = text; $m.appendChild(d); $m.scrollTop = $m.scrollHeight; return d; }
      function sel() {
        var s = $('pl'); s.innerHTML = '<option value="">' + esc(t('bs_new')) + '</option>' + list.map(function (p) { return '<option value="' + p.id + '"' + (project && project.id === p.id ? ' selected' : '') + '>' + esc(p.title) + '</option>'; }).join('');
        var pst = $('pst'); pst.textContent = project ? t('bs_s_' + project.status) : ''; pst.className = 'badge ' + (project && project.status === 'approved' ? 'b-ok' : project && project.status === 'rejected' ? 'b-key' : 'b-soon');
        $('psub').style.display = project && (project.status === 'draft' || project.status === 'rejected') ? '' : 'none';
      }
      function show(p) { project = p; $('pf').innerHTML = p ? frame(p.id) : '<p class="note" style="padding:18px">' + esc(t('bs_empty')) + '</p>'; sel(); }
      function refresh(openId) {
        return j('/studio/api/projects?scope=mine').then(function (r) {
          list = r.projects || [];
          if (openId) { var p = list.filter(function (x) { return x.id === openId; })[0]; if (p) show(p); else sel(); } else sel();
        });
      }
      $('pl').onchange = function () { var id = Number(this.value); var p = list.filter(function (x) { return x.id === id; })[0]; msgs = []; $m.innerHTML = ''; show(p || null); };
      $('psub').onclick = function () {
        if (!project) return;
        post('/studio/api/projects/' + project.id + '/submit').then(function () { line('a', t('bs_sent')); return refresh(project.id); }).catch(function (e) { line('a', e.message || t('bs_err'), 'err'); });
      };
      $('cf').onsubmit = function (ev) {
        ev.preventDefault();
        var text = $i.value.trim(); if (!text || busy) return;
        busy = true; $('cs').disabled = true; $i.value = '';
        line('u', text);
        msgs.push({ role: 'user', text: text });
        var send = msgs.map(function (x, k) { return k === msgs.length - 1 && project ? { role: 'user', text: '[Current project id: ' + project.id + '] ' + x.text } : x; });
        var work = line('a', t('bs_working'), 'work');
        fetch('/studio/api/build', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: send }) }).then(function (r) {
          if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || t('bs_err')); });
          var rd = r.body.getReader(), dec = new TextDecoder(), buf = '', done = Promise.resolve();
          function handle(o) {
            if (o.type === 'tool') work.textContent = t('bs_working') + ' (' + String(o.name).replace(/_/g, ' ') + ')';
            else if (o.type === 'error') { work.remove(); line('a', o.message || t('bs_err'), 'err'); }
            else if (o.type === 'answer') {
              work.remove(); line('a', o.text); msgs.push({ role: 'assistant', text: o.text });
              if (o.projectId) done = refresh(o.projectId);
            }
          }
          function pump() {
            return rd.read().then(function (c) {
              if (c.done) return done;
              buf += dec.decode(c.value, { stream: true });
              var parts = buf.split('\n'); buf = parts.pop();
              parts.forEach(function (p) { if (p.trim()) { try { handle(JSON.parse(p)); } catch (e) {} } });
              return pump();
            });
          }
          return pump();
        }).catch(function (e) { work.remove(); line('a', e.message || t('bs_err'), 'err'); }).then(function () { busy = false; $('cs').disabled = false; $i.focus(); });
      };
      $i.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('cf').requestSubmit(); } };
      refresh(null);
    }).catch(function () { box.innerHTML = '<p>' + esc(t('bs_err')) + '</p>'; });
  };

  /* ---------- Student tools: approved projects, open to everyone with the class sign-in ---------- */
  A.PAGES.portfolio = function () {
    return A.head('h_portfolio', 'p_portfolio').replace(/<div class="demo">.*?<\/div>/, '') + '<div id="tl"></div><div id="rv"></div><div class="card" style="margin-top:18px"><h3>' + esc(t('st_mcp_h')) + '</h3><p class="note">' + esc(t('st_mcp')) + '</p></div>';
  };
  A.AFTER.portfolio = function () {
    loadTools().then(function (tools) {
      $('tl').innerHTML = tools.length ? '<div class="grid">' + tools.map(function (p) { return '<a class="tile" href="#/tool/' + p.id + '"><h3>' + esc(p.title) + '</h3><p>' + esc(p.idea || '') + '</p><p class="note">' + esc(t('st_by') + ' ' + p.author + (p.school ? ' · ' + p.school : '')) + '</p></a>'; }).join('') + '</div>' : '<p class="note">' + esc(t('st_none')) + '</p>';
    });
    j('/studio/api/status').then(function (st) {
      if (!st.user || st.user.role === 'student') return;
      return j('/studio/api/projects?scope=review').then(function (r) {
        var ps = r.projects || []; if (!ps.length) return;
        $('rv').innerHTML = '<h2 style="margin-top:20px">' + esc(t('st_review')) + '</h2>' + ps.map(function (p) {
          return '<div class="card" style="margin:10px 0" data-p="' + p.id + '"><b>' + esc(p.title) + '</b> <span class="note">' + esc(p.author + (p.school ? ' · ' + p.school : '')) + '</span><p class="note">' + esc(p.idea || '') + '</p>' + frame(p.id) +
            '<p><button class="btn" data-d="approve" type="button">' + esc(t('st_approve')) + '</button> <button class="btn ghost" data-d="reject" type="button">' + esc(t('st_reject')) + '</button></p></div>';
        }).join('');
        $('rv').querySelectorAll('[data-d]').forEach(function (b) {
          b.onclick = function () {
            var id = b.closest('[data-p]').dataset.p, d = b.dataset.d;
            var note = d === 'reject' ? (window.prompt('Note for the student') || '') : '';
            post('/studio/api/projects/' + id + '/review', { decision: d, note: note }).then(function () { A.render(); });
          };
        });
      });
    }).catch(function () {});
  };

  /* ---------- One tool, full width ---------- */
  A.PAGES.tool = function () { return '<p><a href="#/portfolio">← ' + esc(t('st_back')) + '</a></p><div id="tv" class="pf big"></div>'; };
  A.AFTER.tool = function () {
    var id = Number((location.hash.split('/')[2] || '').replace(/\D/g, ''));
    if (id) $('tv').innerHTML = frame(id);
  };
})();
