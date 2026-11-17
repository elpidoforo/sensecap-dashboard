/* The questions the Ask bubble offers on each page, in English and Greek. Plain data, loaded the first time a student
   opens the bubble (site/ask-bubble.js). A page with no entry gets the default set.
   They are written as a student would ask them, and every one of them can be answered from what the platform holds:
   none of them asks the assistant to guess, to rank a school or to say what will happen. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  SC.ASK_Q = {
    _default: [
      ['What is this page for?', 'Σε τι χρησιμεύει αυτή η σελίδα;'],
      ['Where does the data on this page come from?', 'Από πού έρχονται τα δεδομένα αυτής της σελίδας;'],
      ['How old are these readings?', 'Πόσο παλιές είναι αυτές οι μετρήσεις;'],
      ['What can this page not tell me?', 'Τι δεν μπορεί να μου πει αυτή η σελίδα;'],
    ],
    home: [
      ['What is Kleanthis, in two sentences?', 'Τι είναι ο Κλεάνθης, σε δύο προτάσεις;'],
      ['Which sensors are sending readings right now?', 'Ποιοι αισθητήρες στέλνουν μετρήσεις αυτή τη στιγμή;'],
      ['Where do I start if I want to answer a question with data?', 'Από πού ξεκινώ αν θέλω να απαντήσω σε μια ερώτηση με δεδομένα;'],
      ['Which parts of this site are measured and which are drawn?', 'Ποια μέρη του site είναι μετρημένα και ποια σχεδιασμένα;'],
    ],
    layers: [
      ['Which layers are answering right now?', 'Ποια στρώματα απαντούν αυτή τη στιγμή;'],
      ['Do two sources agree about the temperature in my city?', 'Συμφωνούν δύο πηγές για τη θερμοκρασία στην πόλη μου;'],
      ['What is the difference between a sensor and a model here?', 'Ποια είναι η διαφορά ανάμεσα σε αισθητήρα και μοντέλο εδώ;'],
      ['Why does one layer say it is late?', 'Γιατί ένα στρώμα λέει ότι άργησε;'],
    ],
    stack: [
      ['Why are some sheets marked "drawn"?', 'Γιατί κάποια φύλλα γράφουν «σχεδιασμένο»;'],
      ['What do the two dots on a bar mean?', 'Τι σημαίνουν οι δύο κουκκίδες πάνω σε μια μπάρα;'],
      ['What does the ring around a school show?', 'Τι δείχνει ο δακτύλιος γύρω από ένα σχολείο;'],
      ['Which sheets stand on a real measurement?', 'Ποια φύλλα στηρίζονται σε πραγματική μέτρηση;'],
      ['Where does the wind direction come from?', 'Από πού έρχεται η κατεύθυνση του ανέμου;'],
    ],
    health: [
      ['What does a failed check mean for a number?', 'Τι σημαίνει ένας έλεγχος που απέτυχε για έναν αριθμό;'],
      ['Why were readings thrown away today?', 'Γιατί πετάχτηκαν μετρήσεις σήμερα;'],
      ['Which source should I be careful with?', 'Με ποια πηγή πρέπει να είμαι προσεκτικός;'],
      ['How can I check one of these numbers myself?', 'Πώς μπορώ να ελέγξω μόνος μου έναν από αυτούς τους αριθμούς;'],
    ],
    fieldwork: [
      ['What is in these datasets?', 'Τι περιέχουν αυτά τα σύνολα δεδομένων;'],
      ['Who published this data and under what licence?', 'Ποιος δημοσίευσε αυτά τα δεδομένα και με ποια άδεια;'],
      ['How do I download the numbers behind a chart?', 'Πώς κατεβάζω τους αριθμούς πίσω από ένα διάγραμμα;'],
      ['Can I compare this with our own sensors?', 'Μπορώ να το συγκρίνω με τους δικούς μας αισθητήρες;'],
    ],
    board: [
      ['What is the newest reading for my school?', 'Ποια είναι η πιο πρόσφατη μέτρηση για το σχολείο μου;'],
      ['Is the air inside different from the air outside?', 'Διαφέρει ο αέρας μέσα από τον αέρα έξω;'],
      ['What does the CO2 number mean for the classroom?', 'Τι σημαίνει ο αριθμός του CO2 για την τάξη;'],
      ['Which numbers here are from our own sensors?', 'Ποιοι αριθμοί εδώ είναι από τους δικούς μας αισθητήρες;'],
    ],
    explore: [
      ['How do I compare two days?', 'Πώς συγκρίνω δύο μέρες;'],
      ['Which measurement should I pick for my question?', 'Ποια μέτρηση να διαλέξω για την ερώτησή μου;'],
      ['What does a gap in the line mean?', 'Τι σημαίνει ένα κενό στη γραμμή;'],
      ['How do I download what I am looking at?', 'Πώς κατεβάζω αυτό που βλέπω;'],
    ],
    weather: [
      ['What are the Met Office stations reporting now?', 'Τι αναφέρουν τώρα οι σταθμοί της Μετεωρολογικής;'],
      ['How is a station different from our sensor?', 'Σε τι διαφέρει ένας σταθμός από τον αισθητήρα μας;'],
      ['What warnings are in force today?', 'Ποιες προειδοποιήσεις ισχύουν σήμερα;'],
      ['How far back does this record go?', 'Πόσο πίσω πάει αυτό το αρχείο;'],
    ],
    city: [
      ['What am I looking at in this 3D view?', 'Τι βλέπω σε αυτή την τρισδιάστατη προβολή;'],
      ['Are the buildings real or drawn?', 'Τα κτίρια είναι πραγματικά ή σχεδιασμένα;'],
      ['Why is no vehicle shown here?', 'Γιατί δεν εμφανίζεται κανένα όχημα εδώ;'],
      ['Where does the street data come from?', 'Από πού έρχονται τα δεδομένα των δρόμων;'],
    ],
    city3d: [
      ['What do the layers on the rail do?', 'Τι κάνουν τα στρώματα στη μπάρα;'],
      ['Is the relief measured or drawn?', 'Το ανάγλυφο είναι μετρημένο ή σχεδιασμένο;'],
      ['Which schools are marked on the island?', 'Ποια σχολεία είναι σημειωμένα στο νησί;'],
      ['What can I learn from this that a table cannot show?', 'Τι μπορώ να μάθω εδώ που δεν δείχνει ένας πίνακας;'],
    ],
    vehicles: [
      ['Why is a sensor quiet?', 'Γιατί ένας αισθητήρας είναι σιωπηλός;'],
      ['What does this sensor measure?', 'Τι μετρά αυτός ο αισθητήρας;'],
      ['Why is no position shown?', 'Γιατί δεν εμφανίζεται θέση;'],
      ['When did it last report?', 'Πότε έστειλε τελευταία φορά;'],
    ],
    alerts: [
      ['Why was this alert raised?', 'Γιατί βγήκε αυτή η ειδοποίηση;'],
      ['What line was crossed, and who set it?', 'Ποιο όριο ξεπεράστηκε και ποιος το όρισε;'],
      ['What should the class do about it?', 'Τι μπορεί να κάνει η τάξη γι’ αυτό;'],
      ['Is this about our sensor or a public one?', 'Αφορά τον δικό μας αισθητήρα ή έναν δημόσιο;'],
    ],
    versus: [
      ['Why do these two cities differ?', 'Γιατί διαφέρουν αυτές οι δύο πόλεις;'],
      ['Is this difference bigger than the tolerance?', 'Είναι αυτή η διαφορά μεγαλύτερη από την ανοχή;'],
      ['Are both numbers from the same kind of source?', 'Είναι και οι δύο αριθμοί από το ίδιο είδος πηγής;'],
      ['What would make this comparison unfair?', 'Τι θα έκανε αυτή τη σύγκριση άδικη;'],
    ],
    changed: [
      ['What changed most since yesterday?', 'Τι άλλαξε περισσότερο από χθες;'],
      ['Did any layer go quiet?', 'Σώπασε κάποιο στρώμα;'],
      ['Is this change big enough to matter?', 'Είναι αρκετά μεγάλη αυτή η αλλαγή για να μετράει;'],
      ['What could explain it?', 'Τι θα μπορούσε να το εξηγεί;'],
    ],
    school360: [
      ['What does this school measure?', 'Τι μετρά αυτό το σχολείο;'],
      ['How does it compare with the nearest station?', 'Πώς συγκρίνεται με τον πλησιέστερο σταθμό;'],
      ['Which of its sensors are online?', 'Ποιοι από τους αισθητήρες του είναι ενεργοί;'],
      ['What should I look at first?', 'Τι να κοιτάξω πρώτα;'],
    ],
    bubbles: [
      ['What does the size of a bubble mean?', 'Τι σημαίνει το μέγεθος μιας φούσκας;'],
      ['Which measurement is this?', 'Ποια μέτρηση είναι αυτή;'],
      ['Why is one bubble missing?', 'Γιατί λείπει μια φούσκα;'],
      ['How fresh are these numbers?', 'Πόσο πρόσφατοι είναι αυτοί οι αριθμοί;'],
    ],
    districts: [
      ['What is this district known for in the data?', 'Τι ξεχωρίζει σε αυτή την επαρχία στα δεδομένα;'],
      ['How many people live here, and from which census?', 'Πόσοι άνθρωποι ζουν εδώ και από ποια απογραφή;'],
      ['Which of our schools is in this district?', 'Ποιο από τα σχολεία μας είναι σε αυτή την επαρχία;'],
      ['What should I not conclude from this map?', 'Τι δεν πρέπει να συμπεράνω από αυτόν τον χάρτη;'],
    ],
    feeds: [
      ['Which feeds are working right now?', 'Ποιες πηγές δουλεύουν αυτή τη στιγμή;'],
      ['How often does each one send?', 'Πόσο συχνά στέλνει η καθεμιά;'],
      ['What happens when a feed stops?', 'Τι γίνεται όταν σταματήσει μια πηγή;'],
      ['Which feed is behind the number I just saw?', 'Ποια πηγή είναι πίσω από τον αριθμό που μόλις είδα;'],
    ],
    archive: [
      ['How far back does the archive go?', 'Πόσο πίσω πάει το αρχείο;'],
      ['How do I get the numbers for one day?', 'Πώς παίρνω τους αριθμούς μιας ημέρας;'],
      ['What is kept and what is not?', 'Τι κρατιέται και τι όχι;'],
      ['Can I use this in a school report?', 'Μπορώ να το χρησιμοποιήσω σε σχολική εργασία;'],
    ],
    brief: [
      ['What is worth knowing this morning?', 'Τι αξίζει να ξέρω σήμερα το πρωί;'],
      ['Which numbers in this brief are measured?', 'Ποιοι αριθμοί σε αυτή την ενημέρωση είναι μετρημένοι;'],
      ['Why is one city missing today?', 'Γιατί λείπει μια πόλη σήμερα;'],
      ['How was this brief put together?', 'Πώς φτιάχτηκε αυτή η ενημέρωση;'],
    ],
    timemachine: [
      ['What was happening at this moment?', 'Τι συνέβαινε αυτή τη στιγμή;'],
      ['How do I move through the day?', 'Πώς κινούμαι μέσα στην ημέρα;'],
      ['Why does a line stop in the middle?', 'Γιατί μια γραμμή σταματά στη μέση;'],
      ['Is every city in this replay?', 'Είναι όλες οι πόλεις σε αυτή την επανάληψη;'],
    ],
    ask: [],
  };
}());
