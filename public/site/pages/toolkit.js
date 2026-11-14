/*
  Toolkit: one page that lists every tool of the platform in groups, each with one line on what it does and an honest status chip:
    now      works now: open it and it shows something without anything else
    saved    needs saved data: it shows more the longer the platform has been saving readings
    teacher  needs a teacher: a teacher signs in, approves or switches it on
    coming   not built yet (no link)
  The list is the TOOLS array below. A tool whose page is not routable (not in SC.ready and not in window.SC_PAGES, i.e. not in
  /site/pages/index.json) is always shown as "coming", whatever its line says. A search box and the chips filter the list.
  No data is loaded and nothing is saved.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/tk1.css');

  const GROUPS = [
    ['new', 'New tools', 'Νέα εργαλεία'],
    ['today', 'Today', 'Σήμερα'],
    ['record', 'The record', 'Το αρχείο'],
    ['places', 'Schools and places', 'Σχολεία και τόποι'],
    ['think', 'Think', 'Σκέψη'],
    ['field', 'In the field', 'Στο πεδίο'],
    ['sources', 'Data sources', 'Πηγές δεδομένων'],
    ['output', 'Output', 'Παραγωγή'],
    ['oversight', 'Oversight', 'Εποπτεία'],
  ];
  // [id, group, status when its page exists, English name, Greek name, English line, Greek line]
  const TOOLS = [
    ['toolkit', 'new', 'now', 'Toolkit', 'Εργαλειοθήκη', 'This page: every tool in one list, with what it does and whether it works yet.', 'Αυτή η σελίδα: κάθε εργαλείο σε μία λίστα, με το τι κάνει και αν δουλεύει ήδη.'],
    ['changed', 'new', 'saved', 'What changed since yesterday', 'Τι άλλαξε από χθες', 'The newest reading of each city against the oldest saved one, the layers that went quiet and the sources that differ.', 'Η πιο πρόσφατη μέτρηση κάθε πόλης απέναντι στην παλαιότερη αποθηκευμένη, τα στρώματα που σώπασαν και οι πηγές που διαφέρουν.'],
    ['versus', 'new', 'now', 'City vs city', 'Πόλη με πόλη', 'Two cities side by side on the same measures, each number with its time and layer. No winner.', 'Δύο πόλεις δίπλα δίπλα στις ίδιες μετρήσεις, κάθε αριθμός με την ώρα και το στρώμα του. Χωρίς νικητή.'],
    ['school360', 'new', 'now', 'School 360', 'Σχολείο 360', 'One school and one topic: sensors online, readings for its city, the saved day and open differences.', 'Ένα σχολείο και ένα θέμα: αισθητήρες σε λειτουργία, μετρήσεις για την πόλη του, η αποθηκευμένη μέρα και ανοιχτές διαφορές.'],
    ['bubbles', 'new', 'saved', 'Measurement bubbles', 'Φούσκες μετρήσεων', 'A bubble for each measurement of each city: big means unusual today, not bad.', 'Μία φούσκα για κάθε μέτρηση κάθε πόλης: μεγάλη σημαίνει ασυνήθιστη σήμερα, όχι κακή.'],
    ['radar', 'new', 'saved', 'Event radar', 'Ραντάρ γεγονότων', 'Moments in the saved day when a reading moved unusually or sources started to differ, grouped by city and hour.', 'Στιγμές της αποθηκευμένης μέρας όπου μια μέτρηση κινήθηκε ασυνήθιστα ή οι πηγές άρχισαν να διαφέρουν, ανά πόλη και ώρα.'],
    ['episode', 'new', 'saved', 'How an event unfolded', 'Πώς εξελίχθηκε ένα γεγονός', 'One event hour by hour, with one row for every source, also the ones that stayed calm.', 'Ένα γεγονός ώρα με την ώρα, με μία γραμμή για κάθε πηγή, ακόμη και όσες έμειναν ήρεμες.'],
    ['watch', 'new', 'now', 'My watch', 'Η παρακολούθησή μου', 'Build a rule from menus, test it on the saved day and keep it in your own browser. It never sends messages.', 'Φτιάξε έναν κανόνα από μενού, δοκίμασέ τον στην αποθηκευμένη μέρα και κράτησέ τον στο δικό σου πρόγραμμα περιήγησης. Δεν στέλνει ποτέ μηνύματα.'],
    ['brief', 'new', 'now', 'Morning brief', 'Πρωινή ενημέρωση', 'Five short lines for a school this morning, each with its time and layer. Can be printed.', 'Πέντε σύντομες γραμμές για ένα σχολείο σήμερα το πρωί, η καθεμία με την ώρα και το στρώμα της. Εκτυπώνεται.'],
    ['vent', 'new', 'saved', 'Ventilation coach', 'Οδηγός αερισμού', 'CO₂ from our own sensors against common guidance levels. Says plainly when the readings come from buses and cars, not classrooms.', 'Το CO₂ από τους δικούς μας αισθητήρες απέναντι σε συνηθισμένα όρια καθοδήγησης. Λέει καθαρά πότε οι μετρήσεις είναι από λεωφορεία και αυτοκίνητα, όχι από τάξεις.'],
    ['forecast', 'new', 'saved', 'Forecast against reality', 'Πρόβλεψη και πραγματικότητα', 'What was forecast for a day next to what was then measured, with the error in plain words. Fills one day at a time.', 'Τι είχε προβλεφθεί για μια μέρα δίπλα σε αυτό που μετρήθηκε μετά, με το σφάλμα σε απλά λόγια. Γεμίζει μία μέρα τη φορά.'],
    ['beforeafter', 'new', 'saved', 'Before and after', 'Πριν και μετά', 'Pick the moment of an action and compare the readings before and after it. Says when you cannot tell.', 'Διάλεξε τη στιγμή μιας δράσης και σύγκρινε τις μετρήσεις πριν και μετά. Λέει πότε δεν μπορείς να βγάλεις συμπέρασμα.'],
    ['timemachine', 'new', 'now', 'Time machine', 'Μηχανή του χρόνου', 'The bathing-water record from 2004 to 2025 on the island, year by year. It is history, not the water today.', 'Το αρχείο των νερών κολύμβησης από το 2004 ως το 2025 πάνω στο νησί, χρόνο με τον χρόνο. Είναι ιστορικό, όχι το σημερινό νερό.'],
    ['askmap', 'new', 'now', 'Ask the map', 'Ρώτα τον χάρτη', 'Choose what to colour, where to look and two moments to compare, then download what you see.', 'Διάλεξε τι θα χρωματίσεις, πού θα κοιτάξεις και δύο στιγμές για σύγκριση, και μετά κατέβασε αυτό που βλέπεις.'],
    ['claims', 'new', 'now', 'Claim check', 'Έλεγχος ισχυρισμού', 'Build a statement from blocks and see whether the data supports it, does not support it, or cannot tell, with every number shown.', 'Φτιάξε μια πρόταση από κομμάτια και δες αν τα δεδομένα τη στηρίζουν, δεν τη στηρίζουν ή δεν μπορούν να πουν, με κάθε αριθμό να φαίνεται.'],
    ['notebook', 'new', 'now', 'Field notebook', 'Τετράδιο πεδίου', 'Log what you see (sky, wind, windows, dust) next to the readings of that moment. Kept in your own browser only.', 'Γράψε τι βλέπεις (ουρανός, άνεμος, παράθυρα, σκόνη) δίπλα στις μετρήσεις εκείνης της στιγμής. Μένει μόνο στο δικό σου πρόγραμμα περιήγησης.'],
    ['experiment', 'new', 'now', 'Experiment builder', 'Σχεδίασε ένα πείραμα', 'Five steps to a fair test: a question, a guess, what to measure, for how long, how to compare. Gives a one-page plan.', 'Πέντε βήματα για ένα δίκαιο πείραμα: ερώτηση, πρόβλεψη, τι θα μετρήσεις, για πόσο, πώς θα συγκρίνεις. Δίνει ένα σχέδιο μίας σελίδας.'],
    ['lessons', 'new', 'now', 'Lesson packs', 'Πακέτα μαθημάτων', 'Seven 45-minute investigations for ages 12 to 15, each tied to a tool of the platform. Can be printed.', 'Επτά έρευνες των 45 λεπτών για ηλικίες 12 έως 15, η καθεμία δεμένη με ένα εργαλείο της πλατφόρμας. Εκτυπώνονται.'],
    ['methods', 'new', 'now', 'Methods library', 'Βιβλιοθήκη μεθόδων', 'Ten short cards on measuring well: averages, spread, why two sensors differ, and why a link is not a cause.', 'Δέκα σύντομες κάρτες για το πώς μετράμε σωστά: μέσοι όροι, εύρος, γιατί δύο αισθητήρες διαφέρουν και γιατί μια σχέση δεν είναι αιτία.'],

    ['home', 'today', 'now', 'The whole project', 'Όλο το έργο', 'The map of the whole platform: eight windows in the order the data travels.', 'Ο χάρτης όλης της πλατφόρμας: οκτώ παράθυρα με τη σειρά που ταξιδεύουν τα δεδομένα.'],
    ['board', 'today', 'now', 'City board', 'Πίνακας πόλης', 'The island with a column at each school: sensors online, warnings and vehicles on the road.', 'Το νησί με μια στήλη σε κάθε σχολείο: αισθητήρες σε λειτουργία, προειδοποιήσεις και οχήματα στον δρόμο.'],
    ['city', 'today', 'now', 'City centres in 3D', 'Κέντρα πόλεων σε 3D', 'Fly from the island down to a city centre: its buildings and streets in 3D.', 'Πέτα από το νησί σε ένα κέντρο πόλης: τα κτίρια και οι δρόμοι του σε 3D.'],
    ['city3d', 'today', 'now', 'Cyprus 3D', 'Κύπρος 3D', 'Our 3D island with a rail of layers to switch on and off.', 'Το τρισδιάστατο νησί μας με μια μπάρα στρωμάτων που ανοίγουν και κλείνουν.'],
    ['alerts', 'today', 'teacher', 'Alerts', 'Ειδοποιήσεις', 'Alerts from rules that teachers write, such as high CO2. Each names its source and rule, never a person.', 'Ειδοποιήσεις από κανόνες που γράφουν οι εκπαιδευτικοί, όπως υψηλό CO2. Καθεμία δείχνει την πηγή και τον κανόνα της, ποτέ πρόσωπο.'],
    ['ask', 'today', 'now', 'Ask', 'Ρωτήστε', 'A full-screen assistant that answers from live tools and the handbook, with source chips.', 'Βοηθός πλήρους οθόνης που απαντά από ζωντανά εργαλεία και το εγχειρίδιο, με ετικέτες πηγών.'],

    ['layers', 'record', 'now', 'Data layers', 'Στρώματα δεδομένων', 'Every open source for the cities as a layer, with live views and a reader that writes findings with sources and gaps.', 'Κάθε ανοιχτή πηγή για τις πόλεις ως στρώμα, με ζωντανές προβολές και έναν αναγνώστη που γράφει ευρήματα με πηγές και κενά.'],
    ['weather', 'record', 'now', 'Met Office record', 'Μετεωρολογικό αρχείο', 'Warnings, forecast, radar, sea and stations with 24 hours of history.', 'Προειδοποιήσεις, πρόγνωση, ραντάρ, θάλασσα και σταθμοί με ιστορικό 24 ωρών.'],
    ['explore', 'record', 'now', 'Explore data', 'Εξερεύνηση', 'Compare, timeline, number finder and our sensor against the official station.', 'Σύγκριση, χρονολόγιο, εύρεση αριθμού και ο αισθητήρας μας απέναντι στον επίσημο σταθμό.'],
    ['library', 'record', 'now', 'Library', 'Βιβλιοθήκη', 'The handbook, sensor guides, data sources and a glossary.', 'Το εγχειρίδιο, οδηγοί αισθητήρων, πηγές δεδομένων και γλωσσάρι.'],

    ['join', 'places', 'teacher', 'Join or sign in', 'Εγγραφή ή σύνδεση', 'Ask for your own account with your city and team. A teacher approves every request.', 'Ζήτησε δικό σου λογαριασμό με την πόλη και την ομάδα σου. Κάθε αίτημα το εγκρίνει ένας εκπαιδευτικός.'],
    ['schools', 'places', 'now', 'Schools and teams', 'Σχολεία και ομάδες', 'Four school cards and team cards. Team names and topics only, no student names.', 'Τέσσερις κάρτες σχολείων και κάρτες ομάδων. Μόνο ονόματα και θέματα ομάδων, χωρίς ονόματα μαθητών.'],
    ['districts', 'places', 'now', 'Districts and neighbourhoods', 'Επαρχίες και γειτονιές', 'Readings by district and by 1 km route cell for the four cities.', 'Μετρήσεις ανά επαρχία και ανά κελί διαδρομής 1 χλμ. για τις τέσσερις πόλεις.'],
    ['guides', 'places', 'now', 'Sensor guides', 'Οδηγοί αισθητήρων', 'One sheet per sensor type: what it measures, the normal range and common mistakes.', 'Ένα φύλλο ανά τύπο αισθητήρα: τι μετρά, το φυσιολογικό εύρος και συνηθισμένα λάθη.'],

    ['council', 'think', 'teacher', 'Council room', 'Αίθουσα συμβουλίου', 'Six AI role-play seats argue a city decision from our data. A teacher approves what is published.', 'Έξι θέσεις ρόλων με ΤΝ συζητούν μια απόφαση για την πόλη με τα δεδομένα μας. Ένας εκπαιδευτικός εγκρίνει ό,τι δημοσιεύεται.'],
    ['mirror', 'think', 'now', 'Mirror', 'Καθρέφτης', 'A simulated commute on a real route and the PM2.5 each way of travel would breathe. Labelled as a simulation.', 'Μια προσομοιωμένη μετακίνηση σε πραγματική διαδρομή και το PM2.5 που θα ανέπνεε κανείς με κάθε τρόπο. Σημειώνεται ως προσομοίωση.'],
    ['whatif', 'think', 'now', 'What-if', 'Σενάρια', 'Sliders and an estimate with a range. Marked as an estimate, not a measurement.', 'Ρυθμιστικά και μια εκτίμηση με εύρος. Σημειώνεται ως εκτίμηση, όχι μέτρηση.'],
    ['reports', 'think', 'teacher', 'Reports', 'Αναφορές', 'The weekly school report and the print summary. A teacher releases it.', 'Η εβδομαδιαία αναφορά σχολείου και η περίληψη για εκτύπωση. Τη δημοσιεύει ένας εκπαιδευτικός.'],

    ['map', 'field', 'now', 'Live map', 'Ζωντανός χάρτης', 'Our layered map: satellite, radar, wind, stations and a time-lapse.', 'Ο χάρτης μας με επίπεδα: δορυφόρος, ραντάρ, άνεμος, σταθμοί και χρονική επιτάχυνση.'],
    ['vehicles', 'field', 'now', 'Vehicles', 'Οχήματα', 'A card for each bus and car with its status and small readings. Positions are late and rounded.', 'Μια κάρτα για κάθε λεωφορείο και αυτοκίνητο με την κατάσταση και μικρές μετρήσεις. Οι θέσεις έχουν καθυστέρηση και στρογγυλοποίηση.'],
    ['trip', 'field', 'saved', 'Follow one trip', 'Ακολούθησε μία διαδρομή', 'Replay one trip with the readings along it. Positions are delayed and rounded.', 'Ξαναδές μία διαδρομή με τις μετρήσεις κατά μήκος της. Οι θέσεις έχουν καθυστέρηση και στρογγυλοποίηση.'],
    ['desk', 'field', 'now', 'Today\'s desk', 'Το γραφείο σήμερα', 'A daily checklist for a class: check a sensor, compare with a station, read the warnings.', 'Καθημερινή λίστα για μια τάξη: έλεγξε έναν αισθητήρα, σύγκρινε με έναν σταθμό, διάβασε τις προειδοποιήσεις.'],
    ['projects', 'field', 'now', 'Running projects', 'Ενεργά έργα', 'Team projects in progress, with their status.', 'Ομαδικά έργα σε εξέλιξη, με την κατάστασή τους.'],
    ['start', 'field', 'now', 'Start a project', 'Νέο έργο', 'Four steps: question, sensors, data, team.', 'Τέσσερα βήματα: ερώτηση, αισθητήρες, δεδομένα, ομάδα.'],

    ['research', 'sources', 'now', 'Research', 'Έρευνα', 'Search the archive, the handbook and the Met Office pages in one box.', 'Αναζήτηση στο αρχείο, στο εγχειρίδιο και στις σελίδες της Μετεωρολογικής σε ένα πλαίσιο.'],
    ['archive', 'sources', 'saved', 'Data archive', 'Αρχείο δεδομένων', 'The history we keep: days stored, coverage and downloads.', 'Το ιστορικό που κρατάμε: ημέρες που έχουν αποθηκευτεί, κάλυψη και λήψεις.'],
    ['feeds', 'sources', 'now', 'Feed list', 'Λίστα πηγών', 'Each feed with its last success, on or off.', 'Κάθε πηγή με την τελευταία της επιτυχία, ενεργή ή ανενεργή.'],
    ['helpers', 'sources', 'now', 'Helpers', 'Βοηθοί', 'The background savers and the assistant, with last run and health.', 'Οι βοηθοί που αποθηκεύουν στο παρασκήνιο και ο βοηθός ΤΝ, με την τελευταία εκτέλεση και την κατάστασή τους.'],
    ['warnings', 'sources', 'saved', 'Warnings watch', 'Παρακολούθηση προειδοποιήσεων', 'Changes to the Met Office warnings and radar over time.', 'Αλλαγές στις προειδοποιήσεις και στο ραντάρ της Μετεωρολογικής με τον χρόνο.'],

    ['workshop', 'output', 'now', 'Workshop', 'Εργαστήρι', 'Drag boxes of data, views, analysis and prediction together to make your own tool, and test it on the saved day.', 'Σύρε κουτιά με δεδομένα, προβολές, ανάλυση και πρόβλεψη για να φτιάξεις το δικό σου εργαλείο, και δοκίμασέ το στην αποθηκευμένη μέρα.'],
    ['studio', 'output', 'teacher', 'Build studio', 'Στούντιο', 'Students describe a tool, the AI drafts it, a teacher approves it.', 'Οι μαθητές περιγράφουν ένα εργαλείο, η ΤΝ το σχεδιάζει, ένας εκπαιδευτικός το εγκρίνει.'],
    ['submitted', 'output', 'teacher', 'Submitted work', 'Υποβολές', 'The queue of submitted tools and reports. Teachers decide.', 'Η ουρά των εργαλείων και των αναφορών που υποβλήθηκαν. Αποφασίζουν οι εκπαιδευτικοί.'],

    ['approvals', 'oversight', 'teacher', 'Approvals', 'Εγκρίσεις', 'Teacher sign-in only: tools, reports and accounts waiting for a decision.', 'Μόνο με σύνδεση εκπαιδευτικού: εργαλεία, αναφορές και λογαριασμοί που περιμένουν απόφαση.'],
    ['opsmap', 'oversight', 'teacher', 'Operations map', 'Χάρτης λειτουργιών', 'Teacher sign-in only: sensors, server, feeds and the assistant as nodes with live status.', 'Μόνο με σύνδεση εκπαιδευτικού: αισθητήρες, διακομιστής, πηγές και βοηθός ως κόμβοι με ζωντανή κατάσταση.'],
    ['league', 'oversight', 'teacher', 'League', 'Πρωτάθλημα', 'Off unless a teacher switches it on. Schools only, from data collected, never people.', 'Ανενεργό εκτός αν το ανοίξει ένας εκπαιδευτικός. Μόνο σχολεία, από τα δεδομένα που συλλέγουν, ποτέ πρόσωπα.'],
    ['settings', 'oversight', 'teacher', 'Settings', 'Ρυθμίσεις', 'Teacher sign-in only: alert thresholds, schools, handbook, feeds.', 'Μόνο με σύνδεση εκπαιδευτικού: όρια ειδοποιήσεων, σχολεία, εγχειρίδιο, πηγές.'],
  ];
  const STATUS = {
    now: ['Works now', 'Δουλεύει τώρα', 'Open it and it shows something straight away.', 'Το ανοίγεις και δείχνει κάτι αμέσως.'],
    saved: ['Needs saved data', 'Θέλει αποθηκευμένα δεδομένα', 'It shows more the longer the platform has been saving readings. On a fresh start it can be nearly empty.', 'Δείχνει περισσότερα όσο περισσότερο καιρό αποθηκεύει μετρήσεις η πλατφόρμα. Σε μια νέα αρχή μπορεί να είναι σχεδόν άδειο.'],
    teacher: ['Needs a teacher', 'Θέλει εκπαιδευτικό', 'A teacher has to sign in, approve or switch it on.', 'Ένας εκπαιδευτικός πρέπει να συνδεθεί, να εγκρίνει ή να το ανοίξει.'],
    coming: ['Coming', 'Έρχεται', 'Not built yet. There is no page to open.', 'Δεν έχει φτιαχτεί ακόμη. Δεν υπάρχει σελίδα να ανοίξεις.'],
  };
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const routable = (id) => Boolean((SC.ready && SC.ready.has(id)) || (window.SC_PAGES || []).indexOf(id) >= 0);

  SC.register('toolkit', {
    title: ['Toolkit', 'Εργαλειοθήκη'],
    render(root) {
      document.title = T('Toolkit', 'Εργαλειοθήκη') + ' · Athena';
      root.append(SC.head({ title: T('Toolkit', 'Εργαλειοθήκη'),
        lede: T('Every tool of the platform in one list: what it does, and an honest word on whether it works yet.', 'Κάθε εργαλείο της πλατφόρμας σε μία λίστα: τι κάνει, και μια ειλικρινής λέξη για το αν δουλεύει ήδη.'),
        help: ['Type in the search box to find a tool by its name or by what it does. The chips filter by status. "Works now" opens and shows something. "Needs saved data" fills up as the platform saves readings. "Needs a teacher" waits for a teacher to sign in, approve or switch it on. "Coming" is not built yet, so it has no link.',
          'Γράψε στο πλαίσιο αναζήτησης για να βρεις ένα εργαλείο από το όνομά του ή από το τι κάνει. Οι ετικέτες φιλτράρουν ανά κατάσταση. Το «Δουλεύει τώρα» ανοίγει και δείχνει κάτι. Το «Θέλει αποθηκευμένα δεδομένα» γεμίζει όσο η πλατφόρμα αποθηκεύει μετρήσεις. Το «Θέλει εκπαιδευτικό» περιμένει έναν εκπαιδευτικό να συνδεθεί, να εγκρίνει ή να το ανοίξει. Το «Έρχεται» δεν έχει φτιαχτεί ακόμη, άρα δεν έχει σύνδεσμο.'] }));
      const tools = TOOLS.map(([id, group, st, en, el, den, del]) => { const open = routable(id); return { id, group, status: open ? st : 'coming', open, name: T(en, el), desc: T(den, del), keys: fold([id, en, el, den, del].join(' ')) }; });
      let q = '', only = 'all';
      const count = h('p', { class: 'tk-count', role: 'status', 'aria-live': 'polite' });
      const list = h('div', { class: 'tk-list' });
      const input = h('input', { type: 'search', id: 'tk-q', class: 'nm-input tk-q', autocomplete: 'off', placeholder: T('For example: map, sensors, compare', 'Για παράδειγμα: χάρτης, αισθητήρες, σύγκριση'), oninput: () => { q = fold(input.value.trim()); paint(); } });
      const chipBox = h('div', { class: 't1-chips tk-chips', role: 'group', 'aria-label': T('Show only', 'Δείξε μόνο') });
      const chip = (s) => h('span', { class: 'tk-st ' + s }, T(STATUS[s][0], STATUS[s][1]));

      function paint() {
        chipBox.replaceChildren(...[['all', T('All', 'Όλα')]].concat(Object.keys(STATUS).map((s) => [s, T(STATUS[s][0], STATUS[s][1])])).map(([s, text]) => {
          const n = s === 'all' ? tools.length : tools.filter((t) => t.status === s).length;
          return h('button', { type: 'button', class: 't1-chip' + (only === s ? ' on' : ''), 'aria-pressed': only === s ? 'true' : 'false', dataset: { s }, onclick: () => { only = s; paint(); const b = chipBox.querySelector('[data-s="' + s + '"]'); if (b) b.focus(); } }, text + ' (' + n + ')');
        }));
        const shown = tools.filter((t) => (only === 'all' || t.status === only) && (!q || t.keys.includes(q)));
        count.textContent = shown.length === tools.length ? T('All ' + tools.length + ' tools are listed.', 'Εμφανίζονται και τα ' + tools.length + ' εργαλεία.') : T('Showing ' + shown.length + ' of ' + tools.length + ' tools.', 'Εμφανίζονται ' + shown.length + ' από ' + tools.length + ' εργαλεία.');
        list.replaceChildren();
        GROUPS.forEach(([g, en, el]) => {
          const mine = shown.filter((t) => t.group === g);
          if (!mine.length) return;
          list.append(h('section', { class: 't1-panel tk-group', dataset: { g } }, h('h2', { class: 't1-h' }, T(en, el), h('small', null, ' ' + mine.length)),
            h('ul', { class: 'tk-grid' }, mine.map((t) => h('li', { class: 'tk-item ' + t.status, dataset: { id: t.id } },
              t.open ? h('a', { class: 'tk-name', href: t.id === 'home' ? '#/' : '#/' + t.id }, t.name) : h('span', { class: 'tk-name' }, t.name),
              chip(t.status), h('p', null, t.desc))))));
        });
        if (!shown.length) list.append(h('p', { class: 't1-empty tk-none' }, T('No tool matches. Try a shorter word, or press "All".', 'Κανένα εργαλείο δεν ταιριάζει. Δοκίμασε μια πιο σύντομη λέξη ή πάτα «Όλα».')));
      }

      root.append(h('div', { class: 't1 tk' },
        h('div', { class: 't1-panel tk-top' },
          h('label', { class: 't1-lab', for: 'tk-q' }, T('Search the tools', 'Αναζήτηση στα εργαλεία')), input, chipBox, count),
        list,
        h('section', { class: 't1-panel tk-legend' }, h('h2', { class: 't1-h' }, T('What the chips mean', 'Τι σημαίνουν οι ετικέτες')),
          h('dl', { class: 'tk-dl' }, Object.keys(STATUS).map((s) => [h('dt', null, chip(s)), h('dd', null, T(STATUS[s][2], STATUS[s][3]))])),
          h('p', { class: 't1-note' }, T('A chip says what the tool needs, not how good it is. A tool marked "Coming" is listed so that you know it is planned; nothing about it is promised by a date.', 'Μια ετικέτα λέει τι χρειάζεται το εργαλείο, όχι πόσο καλό είναι. Ένα εργαλείο με «Έρχεται» μπαίνει στη λίστα για να ξέρεις ότι έχει σχεδιαστεί· δεν υπάρχει υπόσχεση για ημερομηνία.')))));
      paint();
    },
  });
})();
