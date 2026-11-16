/* Show the archive's categorical values in calendar order. */
(function () {
  'use strict';
  const {el, t} = SC;
  const colours = ['#dbe5e8','#f8df78','#ffad66','#f78283','#8ad6ad','#a5c8ff','#c6b0ee'];

  SC.droughtCalendar = function (dataset, current, selectPeriod) {
    const periods = Object.keys(dataset.periodEnds).sort();
    const calendar = el('table', {class:'fw-drought-calendar'});
    const months = el('tr', {}, el('th', {rowspan:2, scope:'col'}, t('Grid cell','Κελί πλέγματος')));
    const days = el('tr');
    const locale = SC.lang === 'el' ? 'el-CY' : 'en-GB';
    const monthFormat = new Intl.DateTimeFormat(locale, {month:'short',timeZone:'UTC'});
    const groups = new Map();
    for (const date of periods) {
      const month = date.slice(0,7);
      groups.set(month,(groups.get(month) || 0) + 1);
    }
    for (const [month, count] of groups) {
      months.append(el('th', {colspan:count,scope:'colgroup'}, monthFormat.format(new Date(month+'-01T00:00:00Z'))));
    }
    function choose(date) {
      selectPeriod(date);
      document.querySelector('.fw-drought-calendar button[aria-pressed="true"]')?.focus({preventScroll:true});
    }
    for (const [index, date] of periods.entries()) {
      const interval = date + ' – ' + dataset.periodEnds[date];
      days.append(el('th', {scope:'col'}, el('button', {
        type:'button', title:interval, 'aria-label':interval, 'aria-pressed':String(date === current),
        tabindex:date === current ? '0' : '-1', onclick:() => choose(date),
        onkeydown:event => {
          const target = {ArrowLeft:index - 1, ArrowRight:index + 1, Home:0, End:periods.length - 1}[event.key];
          if (target === undefined) return;
          event.preventDefault();
          choose(periods[Math.max(0, Math.min(target, periods.length - 1))]);
        }
      }, date.slice(8))));
    }
    calendar.append(el('thead',{},months,days));
    const body = el('tbody');
    for (const site of dataset.series) {
      const name = SC.lang === 'el' ? site.nameEl : site.name;
      const values = new Map(site.points);
      const row = el('tr', {}, el('th',{scope:'row'}, name));
      for (const date of periods) {
        const code = values.get(date);
        const label = dataset.classLabels[code];
        const description = label ? t(...label) : t('No value','Χωρίς τιμή');
        row.append(el('td', {title:description, 'aria-label':description,
          style:{backgroundColor:colours[code] || '#e0e0e0'},
          class:date === current ? 'is-chosen' : null
        }, label ? String(code) : '·'));
      }
      body.append(row);
    }
    calendar.append(body);
    const scroll = el('div',{class:'fw-calendar-scroll'},calendar);
    // Keep the chosen period visible when the compact view scrolls horizontally.
    requestAnimationFrame(() => {
      const chosen = days.querySelector('[aria-pressed="true"]');
      if (!chosen || !scroll.isConnected) return;
      const offset = chosen.getBoundingClientRect().left - scroll.getBoundingClientRect().left;
      scroll.scrollLeft += offset - scroll.clientWidth / 2;
    });
    const legend = el('ul', {class:'fw-class-key'}, Object.entries(dataset.classLabels).map(([code, labels]) =>
      el('li',{},el('span',{style:{backgroundColor:colours[Number(code)]}},code), t(...labels))));
    return el('section', {class:'fw-drought-year'},
      el('h3',{},t('Drought classes across the year','Κατηγορίες ξηρασίας στη διάρκεια του έτους')),
      el('p',{},t('Select a period by its first day to compare the four grid cells.','Επίλεξε την πρώτη ημέρα μιας περιόδου για να συγκρίνεις τα τέσσερα κελιά.')),
      scroll,legend);
  };
})();
