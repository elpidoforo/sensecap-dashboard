(function () {
  var T = {
    en: { sub: 'Cyprus · four schools', out: 'Sign out', h: 'Four schools. One living data classroom.', p: 'Sensors on school buses and cars, satellite views and AI, used by students in Larnaka, Lefkosia, Limassol and Paphos to understand heat and air in their own cities.', t1: 'Live dashboard', d1: 'Vehicles, readings and history from the sensors.', t2: 'Layered map', d2: 'Vehicles, trails, weather, satellite and Met Office stations.', t3: '3D Cyprus', d3: 'The island with terrain, wind, clouds and one column per sensor.', t4: 'Student app', d4: 'Team chat, Ask assistant and the Build studio. Needs your own account.', t5: 'Tool studio', d5: 'Heat maps, averages with ranges, sensor checks and scenarios. Being built next.', ok: 'Works', acct: 'Own account', soon: 'Coming next' },
    el: { sub: 'Κύπρος · τέσσερα σχολεία', out: 'Αποσύνδεση', h: 'Τέσσερα σχολεία. Μία ζωντανή τάξη δεδομένων.', p: 'Αισθητήρες σε σχολικά λεωφορεία και αυτοκίνητα, δορυφορικές εικόνες και τεχνητή νοημοσύνη, για να καταλάβουν οι μαθητές σε Λάρνακα, Λευκωσία, Λεμεσό και Πάφο τη θερμότητα και τον αέρα της πόλης τους.', t1: 'Ζωντανός πίνακας', d1: 'Οχήματα, μετρήσεις και ιστορικό από τους αισθητήρες.', t2: 'Χάρτης με επίπεδα', d2: 'Οχήματα, διαδρομές, καιρός, δορυφόρος και σταθμοί Μετεωρολογικής.', t3: '3D Κύπρος', d3: 'Το νησί με ανάγλυφο, άνεμο, σύννεφα και μία στήλη ανά αισθητήρα.', t4: 'Εφαρμογή μαθητών', d4: 'Συνομιλία ομάδας, βοηθός Ask και Build studio. Θέλει δικό σου λογαριασμό.', t5: 'Tool studio', d5: 'Θερμικοί χάρτες, μέσοι όροι με εύρος, έλεγχοι αισθητήρων και σενάρια. Έρχεται σύντομα.', ok: 'Λειτουργεί', acct: 'Δικός σου λογαριασμός', soon: 'Έρχεται' }
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
  document.getElementById('out').onclick = function () {
    fetch('/cities/api/logout', { method: 'POST' }).finally(function () { location.href = '/cities/login.html'; });
  };
})();
