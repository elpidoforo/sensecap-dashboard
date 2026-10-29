'use strict';
/* Teacher and admin tools (approvals, reports, members, teams, school codes, assistant log, handbook) and the Me screen. */
(function () {
  const { h, api, fmt } = App;

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); App.toast('Copied'); } catch (e) { App.toast('Select the text and copy it', true); }
  };
  const roleLabel = (r) => (r === 'admin' ? 'Admin' : r === 'teacher' ? 'Teacher' : 'Student');

  /* ---------- manage ---------- */

  App.route(/^\/manage(?:\/([a-z]+))?$/, async (view, [tab]) => {
    const me = App.state.me;
    App.setTop({ title: 'Manage' });
    tab = tab || 'approvals';
    const ov = await api('/app/api/manage/overview');
    App.state.pending = ov.pending + ov.reports.length; App.paintBadges();
    const schools = Object.fromEntries(ov.schools.map((s) => [s.id, s]));
    const teamName = (id) => (ov.teams.find((t) => t.id === id) || {}).name || null;
    const pendingShown = ov.members.filter((m) => m.status === 'pending');
    const tabs = [['approvals', 'Approvals', pendingShown.length], ['reports', 'Reports', ov.reports.length], ['members', 'Members', 0], ['teams', 'Teams', 0], ['codes', 'Codes', 0], ['assistant', 'Assistant', 0], ['handbook', 'Handbook', 0]];
    if (me.role === 'admin') tabs.push(['audit', 'History', 0]);
    const page = h('div', { class: 'page' }, h('div', { class: 'seg', role: 'tablist' }, tabs.map(([id, label, n]) =>
      h('button', { class: id === tab ? 'on' : '', role: 'tab', 'aria-selected': String(id === tab), onclick: () => App.go('/manage/' + id) }, label, n ? h('span', { class: 'badge' }, n) : null))));
    const body = h('div');
    page.append(body);
    view.append(page);
    const onTab = page.querySelector('.seg .on');
    if (onTab && onTab.scrollIntoView) onTab.scrollIntoView({ inline: 'center', block: 'nearest' });
    const refresh = () => App.render();
    const fail = (e) => App.toast(e.message, true);
    const act = async (path, data, msg) => { try { const r = await api(path, data === undefined ? {} : data); if (msg) App.toast(msg); return r; } catch (e) { fail(e); return null; } };
    const schoolTag = (id) => (me.role === 'admin' && schools[id] ? h('span', { class: 'tag' }, schools[id].short) : null);

    /* approvals */
    if (tab === 'approvals') {
      if (!pendingShown.length) body.append(h('div', { class: 'empty' }, 'No one is waiting for approval.'));
      else body.append(h('div', { class: 'list' }, pendingShown.map((m) => h('div', { class: 'person' },
        h('div', { class: 'grow' }, h('b', null, m.name, h('span', { class: 'badge-role' }, roleLabel(m.role))), h('span', null, 'Asked ' + fmt.ago(m.created_at)), schoolTag(m.school_id)),
        m.role === 'teacher' && me.role !== 'admin' ? h('span', { class: 'muted small' }, 'Admin approves teachers') : h('div', { class: 'actions' },
          h('button', { class: 'btn small primary', onclick: async () => { if (await act(`/app/api/manage/users/${m.id}/approve`, {}, m.name + ' approved')) refresh(); } }, 'Approve'),
          h('button', { class: 'btn small danger', onclick: async () => { if (await App.confirm('Reject ' + m.name + '?', 'They will not be able to sign in.', 'Reject', true) && await act(`/app/api/manage/users/${m.id}/reject`, {}, 'Rejected')) refresh(); } }, 'Reject'))))));
      body.append(h('p', { class: 'muted small' }, 'Only approve people you know. Check the name matches a student in your class.'));
    }

    /* reports */
    if (tab === 'reports') {
      if (!ov.reports.length) body.append(h('div', { class: 'empty' }, 'No open reports.'));
      ov.reports.forEach((r) => {
        const s = r.snapshot;
        const done = async (action, msg) => { if (await act(`/app/api/manage/reports/${r.id}/resolve`, { action }, msg)) refresh(); };
        body.append(h('div', { class: 'card report' },
          h('div', { class: 'row' }, h('b', null, r.kind === 'bot' ? 'Assistant answer' : 'Message by ' + (s.author || '?')), h('span', { class: 'tag' }, r.reasonText), h('span', { class: 'muted small' }, fmt.ago(r.at) + ' · reported by ' + r.reporter)),
          r.kind === 'bot' ? [h('div', { class: 'quote' }, 'Question: ' + (s.question || '')), h('div', { class: 'quote' }, 'Answer: ' + (s.answer || ''))] : h('div', { class: 'quote' }, s.body || ''),
          r.note ? h('p', { class: 'muted small' }, 'Note: ' + r.note) : null,
          h('div', { class: 'actions' },
            r.kind === 'message' ? [h('button', { class: 'btn small danger', onclick: () => done('delete', 'Message removed') }, 'Delete message'), h('button', { class: 'btn small danger', onclick: () => done('delete_mute', 'Removed and muted for 1 day') }, 'Delete and mute 1 day')] : null,
            h('button', { class: 'btn small', onclick: () => done('dismiss', 'Report closed') }, 'Dismiss'))));
      });
    }

    /* members */
    if (tab === 'members') {
      const people = ov.members.filter((m) => m.status === 'active');
      const myTeams = ov.teams;
      const canManage = (m) => m.id !== me.id && (me.role === 'admin' ? m.role !== 'admin' : m.role === 'student');
      const manageSheet = (m) => {
        const tsel = h('select', { 'aria-label': 'Team' }, h('option', { value: '' }, 'No team'), myTeams.filter((t) => t.school_id === m.school_id).map((t) => h('option', { value: t.id }, t.name)));
        tsel.value = m.team_id || '';
        const muted = m.muted_until > Date.now();
        const sh = App.sheet(m.name, h('div', null,
          h('p', { class: 'muted small' }, roleLabel(m.role) + (schools[m.school_id] ? ' · ' + schools[m.school_id].short : '') + ' · last seen ' + (m.last_seen ? fmt.ago(m.last_seen) : 'never')),
          m.role === 'student' ? h('label', { class: 'field' }, h('span', null, 'Team'), tsel, h('button', { class: 'btn small', style: 'margin-top:8px', onclick: async () => { if (await act(`/app/api/manage/users/${m.id}/team`, { team_id: tsel.value || null }, 'Team saved')) { sh.close(); refresh(); } } }, 'Save team')) : null,
          muted ? h('button', { class: 'opt', onclick: async () => { if (await act(`/app/api/manage/users/${m.id}/unmute`, {}, 'Unmuted')) { sh.close(); refresh(); } } }, 'Unmute') : [['1 hour', 60], ['1 day', 1440], ['1 week', 10080]].map(([label, min]) => h('button', { class: 'opt', onclick: async () => { if (await act(`/app/api/manage/users/${m.id}/mute`, { minutes: min, reason: 'A teacher muted you.' }, `Muted for ${label}`)) { sh.close(); refresh(); } } }, 'Mute for ' + label)),
          h('button', { class: 'opt', onclick: async () => {
            const r = await act(`/app/api/manage/users/${m.id}/reset-password`, {});
            if (r) { sh.close(); App.sheet('Temporary password', h('div', null, h('p', null, 'Give this to ', h('b', null, m.name), '. They must choose a new one when they sign in.'), h('p', { class: 'code' }, r.temporary_password), h('button', { class: 'btn primary', onclick: () => copy(r.temporary_password) }, 'Copy'))); }
          } }, 'Reset password'),
          h('button', { class: 'opt danger', onclick: async () => { sh.close(); if (await App.confirm('Remove ' + m.name + '?', 'Their account is deleted. Their old messages stay but show "Deleted user".', 'Remove', true) && await act(`/app/api/manage/users/${m.id}/remove`, {}, 'Removed')) refresh(); } }, 'Remove account')));
      };
      body.append(people.length ? h('div', { class: 'list' }, people.map((m) => h('div', { class: 'person' },
        h('div', { class: 'grow' }, h('b', null, m.name, m.role !== 'student' ? h('span', { class: 'badge-role' }, roleLabel(m.role)) : null, m.muted_until > Date.now() ? h('span', { class: 'tag', style: 'margin-left:6px' }, 'muted') : null),
          h('span', null, [teamName(m.team_id), me.role === 'admin' && schools[m.school_id] ? schools[m.school_id].short : null, m.last_seen ? 'seen ' + fmt.ago(m.last_seen) : null].filter(Boolean).join(' · ') || ' ')),
        canManage(m) ? h('button', { class: 'btn small', onclick: () => manageSheet(m) }, 'Manage') : null))) : h('div', { class: 'empty' }, 'No members yet.'));
    }

    /* teams */
    if (tab === 'teams') {
      let devices = [];
      try { await App.data.load(false); devices = App.data.devices; } catch (e) { /* vehicle list is optional */ }
      const teamForm = (t) => {
        const name = h('input', { type: 'text', maxlength: '40', value: t ? t.name : '', placeholder: 'Team name', 'aria-label': 'Team name' });
        const veh = h('select', { 'aria-label': 'Vehicle' }, h('option', { value: '' }, 'No vehicle linked'), devices.map((d) => h('option', { value: d.eui }, d.name)));
        veh.value = t && t.device_eui ? t.device_eui : '';
        const sch = me.role === 'admin' && !t ? h('select', { 'aria-label': 'School' }, ov.schools.map((s) => h('option', { value: s.id }, s.name))) : null;
        const sh = App.sheet(t ? 'Edit team' : 'New team', h('div', null,
          sch ? h('label', { class: 'field' }, h('span', null, 'School'), sch) : null,
          h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Vehicle'), veh),
          h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: async () => {
            const payload = { name: name.value, device_eui: veh.value || null };
            const r = t ? await act(`/app/api/manage/teams/${t.id}`, payload, 'Team saved') : await act('/app/api/manage/teams', { ...payload, school_id: sch ? sch.value : undefined }, 'Team created');
            if (r) { sh.close(); refresh(); }
          } }, 'Save'), t ? h('button', { class: 'btn danger', onclick: async () => { sh.close(); if (await App.confirm('Delete ' + t.name + '?', 'Members stay in the school but leave the team. The team chat history is kept but no one can open it.', 'Delete', true) && await act(`/app/api/manage/teams/${t.id}`, { delete: true }, 'Team deleted')) refresh(); } }, 'Delete team') : null)));
      };
      body.append(h('div', { style: 'margin-bottom:12px' }, h('button', { class: 'btn primary', onclick: () => teamForm(null) }, 'New team')));
      if (!ov.teams.length) body.append(h('div', { class: 'empty' }, 'No teams yet. Create one, then add students to it under Members.'));
      ov.teams.forEach((t) => {
        const mem = ov.members.filter((m) => m.team_id === t.id && m.status === 'active');
        const dev = devices.find((d) => d.eui === t.device_eui);
        body.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', { style: 'flex:1' }, t.name), schoolTag(t.school_id), h('button', { class: 'btn small', onclick: () => teamForm(t) }, 'Edit')),
          h('p', { class: 'muted small', style: 'margin:6px 0 0' }, (dev ? 'Vehicle: ' + dev.name + ' · ' : t.device_eui ? 'Vehicle not found · ' : 'No vehicle · ') + mem.length + (mem.length === 1 ? ' member' : ' members') + (mem.length < 5 ? ' (the project asks for at least 5)' : '')),
          mem.length ? h('p', { class: 'small', style: 'margin:6px 0 0' }, mem.map((m) => m.name).join(', ')) : null));
      });
    }

    /* codes */
    if (tab === 'codes') {
      const link = location.origin + '/app/';
      body.append(h('div', { class: 'card' }, h('b', null, 'How students join'), h('p', { class: 'muted small', style: 'margin:6px 0' }, 'Give them this link and their school code. They choose a display name and a password, and you approve them under Approvals.'),
        h('div', { class: 'row' }, h('span', { style: 'word-break:break-all' }, link), h('button', { class: 'btn small', onclick: () => copy(link) }, 'Copy link'))));
      ov.schools.forEach((s) => {
        const match = h('input', { type: 'text', value: s.match, placeholder: 'larnaka, larnaca', 'aria-label': 'Vehicle name words' });
        body.append(h('div', { class: 'card' }, h('div', { class: 'row' }, App.schoolDot(s.short), h('b', null, s.name)),
          h('p', { class: 'muted small', style: 'margin:10px 0 2px' }, 'Student code'),
          h('div', { class: 'row' }, h('span', { class: 'code' }, s.student_code), h('button', { class: 'btn small', onclick: () => copy(s.student_code) }, 'Copy'),
            h('button', { class: 'btn small', onclick: async () => { if (await App.confirm('Make a new student code?', 'The old code stops working. People who already joined are not affected.', 'New code') && await act(`/app/api/manage/schools/${s.id}`, { regenerate: 'student' }, 'New code')) refresh(); } }, 'New code')),
          s.teacher_code ? [h('p', { class: 'muted small', style: 'margin:12px 0 2px' }, 'Teacher code (give only to teachers)'), h('div', { class: 'row' }, h('span', { class: 'code' }, s.teacher_code), h('button', { class: 'btn small', onclick: () => copy(s.teacher_code) }, 'Copy'),
            h('button', { class: 'btn small', onclick: async () => { if (await App.confirm('Make a new teacher code?', 'The old code stops working.', 'New code') && await act(`/app/api/manage/schools/${s.id}`, { regenerate: 'teacher' }, 'New code')) refresh(); } }, 'New code'))] : null,
          me.role === 'admin' ? [h('p', { class: 'muted small', style: 'margin:12px 0 4px' }, 'Vehicles belong to this school when their name or SenseCAP group contains one of these words (separated by commas):'), h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:160px' }, match), h('button', { class: 'btn small', onclick: async () => { if (await act(`/app/api/manage/schools/${s.id}`, { match: match.value }, 'Saved')) refresh(); } }, 'Save'))] : null));
      });
    }

    /* assistant log */
    if (tab === 'assistant') {
      const r = await api('/app/api/manage/botlog');
      body.append(h('p', { class: 'muted small' }, 'Questions students asked the assistant, newest first. Kept for 90 days. Students are told that teachers can read these.'));
      body.append(r.rows.length ? h('div', { class: 'list' }, r.rows.map((x) => h('div', { class: 'logrow' },
        h('div', { class: 'muted small' }, x.user + (schools[x.school_id] && me.role === 'admin' ? ' · ' + schools[x.school_id].short : '') + ' · ' + fmt.full(x.at) + (x.tools.length ? ' · used ' + x.tools.length + ' lookup' + (x.tools.length > 1 ? 's' : '') : '')),
        h('div', { class: 'q' }, x.question), x.error ? h('div', { class: 'a', style: 'color:var(--bad)' }, 'Error: ' + x.error) : h('div', { class: 'a' }, x.answer || '')))) : h('div', { class: 'empty' }, 'No questions yet.'));
    }

    /* handbook */
    if (tab === 'handbook') {
      const r = await api('/app/api/handbook');
      const editor = (d) => {
        const title = h('input', { type: 'text', maxlength: '80', value: d ? d.title : '', 'aria-label': 'Title' });
        const text = h('textarea', { rows: '10', maxlength: '6000', 'aria-label': 'Text' }); text.value = d ? d.body : '';
        const sh = App.sheet(d ? 'Edit page' : 'New page', h('div', null, h('p', { class: 'muted small' }, 'The assistant searches these pages before it answers questions about the project. Write facts, deadlines, instructions.'),
          h('label', { class: 'field' }, h('span', null, 'Title'), title), h('label', { class: 'field' }, h('span', null, 'Text'), text),
          h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: async () => { if (await act('/app/api/manage/handbook', { id: d ? d.id : undefined, title: title.value, body: text.value }, 'Saved')) { sh.close(); refresh(); } } }, 'Save'),
            d ? h('button', { class: 'btn danger', onclick: async () => { sh.close(); if (await App.confirm('Delete "' + d.title + '"?', '', 'Delete', true) && await act(`/app/api/manage/handbook/${d.id}/delete`, {}, 'Deleted')) refresh(); } }, 'Delete') : null)));
      };
      body.append(h('div', { style: 'margin-bottom:12px' }, h('button', { class: 'btn primary', onclick: () => editor(null) }, 'New page')));
      body.append(h('div', { class: 'list' }, r.docs.map((d) => h('button', { class: 'item', onclick: () => editor(d) }, h('div', { class: 'grow' }, h('b', null, d.title), h('span', null, d.body.replace(/\s+/g, ' ').slice(0, 70)))))));
    }

    /* audit */
    if (tab === 'audit') {
      const r = await api('/app/api/manage/audit');
      body.append(h('div', { class: 'list' }, r.rows.map((x) => h('div', { class: 'logrow' }, h('div', { class: 'muted small' }, fmt.full(x.at) + ' · ' + x.actor), h('div', null, x.action + (x.detail ? ': ' + x.detail : ''))))));
      if (!r.rows.length) body.append(h('div', { class: 'empty' }, 'Nothing yet.'));
    }

    const off = App.on('refresh', (d) => { if (d.what === 'pending' || d.what === 'reports') App.render(); });
    App.cleanup(off);
  }, { tab: 'manage', staff: true });

  /* ---------- handbook for everyone ---------- */

  App.route(/^\/handbook$/, async (view) => {
    App.setTop({ title: 'Handbook', back: '/me' });
    const r = await api('/app/api/handbook');
    view.append(h('div', { class: 'page' }, h('p', { class: 'muted small' }, 'The pages the assistant reads before it answers. Your teachers can change them.'),
      r.docs.map((d) => { const det = h('details', { class: 'card' }, h('summary', { style: 'font-weight:700;cursor:pointer' }, d.title)); const b = h('div', { style: 'margin-top:8px' }); b.append(App.md(d.body)); det.append(b); return det; })));
  }, { tab: 'me' });

  /* ---------- me ---------- */

  App.route(/^\/me$/, async (view) => {
    const me = App.state.me;
    App.setTop({ title: 'Me' });
    const pwSheet = () => {
      const old = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Old password' });
      const nw = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password' });
      const err = h('p', { class: 'error hidden' });
      const sh = App.sheet('Change password', h('div', null, h('label', { class: 'field' }, h('span', null, 'Old password'), old), h('label', { class: 'field' }, h('span', null, 'New password'), nw), err,
        h('button', { class: 'btn primary', onclick: async () => { try { await api('/app/api/me/password', { old: old.value, password: nw.value }); sh.close(); App.toast('Password changed'); } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); } } }, 'Save password')));
    };
    const deleteSheet = () => {
      const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' });
      const err = h('p', { class: 'error hidden' });
      const sh = App.sheet('Delete my account', h('div', null, h('p', { class: 'muted' }, 'This deletes your account, your team place and your assistant questions. Your old chat messages stay but show "Deleted user". It cannot be undone.'), h('label', { class: 'field' }, h('span', null, 'Type your password to confirm'), pw), err,
        h('button', { class: 'btn danger', onclick: async () => { try { await api('/app/api/me/delete', { password: pw.value }); sh.close(); App.state.me = null; location.hash = '#/'; App.render(); } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); } } }, 'Delete my account')));
    };
    view.append(h('div', { class: 'page' },
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, me.name), h('span', { class: 'badge-role', style: 'margin:0' }, roleLabel(me.role))),
        h('p', { class: 'muted', style: 'margin:6px 0 0' }, [me.school ? me.school.name : 'Whole project', me.team ? me.team.name : (me.role === 'student' ? 'No team yet' : null)].filter(Boolean).join(' · '))),
      h('div', { class: 'list' },
        h('a', { class: 'item', href: '#/handbook' }, h('div', { class: 'grow' }, h('b', null, 'Handbook'), h('span', null, 'What the assistant knows about the project'))),
        h('button', { class: 'item', onclick: pwSheet }, h('div', { class: 'grow' }, h('b', null, 'Change password'))),
        h('a', { class: 'item', href: '/app/api/me/export', download: 'my-data.json' }, h('div', { class: 'grow' }, h('b', null, 'Download my data'), h('span', null, 'Your messages and questions as a file'))),
        h('button', { class: 'item', onclick: App.signOut }, h('div', { class: 'grow' }, h('b', null, 'Sign out')))),
      h('div', { class: 'card' }, h('b', null, 'Need to talk to someone?'),
        h('p', { class: 'muted', style: 'margin:6px 0 0' }, `If something worries you or you feel unsafe, tell a teacher or an adult you trust today. The Cyprus child helpline is ${App.state.helplines.child || '116111'}. In an emergency call ${App.state.helplines.emergency || '112'}.`)),
      h('div', { class: 'card' }, h('b', null, 'Your data'),
        h('p', { class: 'muted small', style: 'margin:6px 0 0' }, 'This app stores your display name, school, team, a scrambled password, your chat messages and your questions to the assistant. No e-mail, phone number or location of yours. Teachers can read chat and questions. Questions you ask the assistant are sent to Anthropic, the company that runs the AI, to get an answer. Ask your teacher if you want something removed.')),
      App.installHelp(),
      h('div', { style: 'margin-top:18px' }, h('button', { class: 'btn ghost danger small', onclick: deleteSheet }, 'Delete my account'))));
  }, { tab: 'me' });
})();
