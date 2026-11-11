(function () {
  var T = {
    en: { sub: 'Cyprus · four schools', h: 'Student sign in', user: 'User name', pass: 'Password', go: 'Sign in', own: 'Have your own account for chat and the Build studio?', app: 'Open the student app', bad: 'Wrong user name or password.', off: 'The class sign-in is not switched on yet. Ask your teacher.' },
    el: { sub: 'Κύπρος · τέσσερα σχολεία', h: 'Σύνδεση μαθητών', user: 'Όνομα χρήστη', pass: 'Κωδικός', go: 'Σύνδεση', own: 'Έχεις δικό σου λογαριασμό για συνομιλία και Build studio;', app: 'Άνοιξε την εφαρμογή μαθητών', bad: 'Λάθος όνομα χρήστη ή κωδικός.', off: 'Η σύνδεση τάξης δεν είναι ακόμη ενεργή. Ρώτα τον καθηγητή σου.' }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('aisc-lang') === 'el' ? 'el' : 'en'; } catch (e) {}
  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = T[lang][el.dataset.t]; });
    document.querySelectorAll('[data-l]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.l === lang ? 'true' : 'false'); });
  }
  document.querySelectorAll('[data-l]').forEach(function (b) { b.onclick = function () { lang = b.dataset.l; try { localStorage.setItem('aisc-lang', lang); } catch (e) {} apply(); }; });
  apply();
  fetch('/cities/api/session').then(function (r) { return r.json(); }).then(function (s) { if (s.signedIn) location.replace('/cities/'); });
  document.getElementById('f').onsubmit = function (ev) {
    ev.preventDefault();
    var e = document.getElementById('e'); e.textContent = '';
    fetch('/cities/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('n').value, password: document.getElementById('p').value }) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) { if (x.j.ok) location.replace('/cities/'); else e.textContent = x.s === 503 ? T[lang].off : x.s === 429 ? x.j.error : T[lang].bad; })
      .catch(function () { e.textContent = T[lang].bad; });
  };
})();
