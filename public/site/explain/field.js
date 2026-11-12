/* Explainer content: field pages (map, vehicles, trip, desk, projects, start). Plain data, no logic. */
(function () {
  'use strict';
  window.SC = window.SC || {};
  SC.EXPLAIN = SC.EXPLAIN || {};
  Object.assign(SC.EXPLAIN, {

    map: {
      lead: ['Our live map of Cyprus: schools, vehicles and Met Office stations, with weather layers and a replay.', 'Ο ζωντανός χάρτης της Κύπρου: σχολεία, οχήματα και σταθμοί της Μετεωρολογικής, με στρώματα καιρού και επανάληψη.'],
      steps: [
        { scene: 'map', h: ['Choose layers', 'Διάλεξε στρώματα'], s: ['Use Map layers on the left to show schools, vehicles, stations, wind, rain or satellite.', 'Στα «Στρώματα χάρτη» αριστερά, άναψε σχολεία, οχήματα, σταθμούς, άνεμο, βροχή ή δορυφόρο.'], c: ['Wind, rain and temperature layers come from a weather model, not from our sensors.', 'Ο άνεμος, η βροχή και η θερμοκρασία προέρχονται από μοντέλο καιρού, όχι από τους αισθητήρες μας.'] },
        { scene: 'sensor', h: ['Press a dot', 'Πάτα ένα σημείο'], s: ['Press a vehicle or a Met Office station to see its reading and a 24 hour chart.', 'Πάτα ένα όχημα ή έναν σταθμό για να δεις τη μέτρησή του και ένα γράφημα 24 ωρών.'] },
        { scene: 'compare', h: ['Compare', 'Σύγκρινε'], s: ['A vehicle card sets our reading beside the weather model and the nearest Met Office station.', 'Η κάρτα ενός οχήματος βάζει τη μέτρησή μας δίπλα στο μοντέλο καιρού και στον κοντινότερο σταθμό.'] },
        { scene: 'clock', h: ['Replay the day', 'Επανάληψη ημέρας'], s: ['Press play on the Replay bar at the bottom to see the last hours again. Live brings you back.', 'Πάτα αναπαραγωγή στη γραμμή «Επανάληψη» κάτω, για να δεις ξανά τις τελευταίες ώρες. Το «Ζωντανά» σε γυρίζει πίσω.'] },
        { scene: 'lock', h: ['Delayed', 'Με καθυστέρηση'], s: ['Vehicle positions are about 2 hours late and rounded to 1 km. This protects the students on board.', 'Οι θέσεις των οχημάτων έχουν καθυστέρηση περίπου 2 ωρών και στρογγυλοποίηση 1 χλμ. Έτσι προστατεύονται οι μαθητές.'], c: ['You see where a vehicle was, never where it is now.', 'Βλέπεις πού ήταν ένα όχημα, ποτέ πού είναι τώρα.'] },
      ],
    },

    vehicles: {
      lead: ['Every bus and car that carries a sensor, with its latest readings. Positions are late and rounded.', 'Κάθε λεωφορείο και αυτοκίνητο που φέρει αισθητήρα, με τις τελευταίες μετρήσεις. Οι θέσεις έχουν καθυστέρηση.'],
      steps: [
        { scene: 'bus', h: ['See them all', 'Δες τα οχήματα'], s: ['Three tiles count them: On the road, Parked and Quiet over 1 h. Filter by Buses or Cars.', 'Τρία πλακίδια: Στον δρόμο, Σταθμευμένα, Σιωπηλά > 1 ώρα. Φίλτραρε σε Λεωφορεία ή Αυτοκίνητα.'] },
        { scene: 'sensor', h: ['Read a card', 'Διάβασε μια κάρτα'], s: ['Each card shows the latest readings with a 24 hour line, the battery and the last signal.', 'Κάθε κάρτα δείχνει τις τελευταίες μετρήσεις με γραμμή 24 ωρών, την μπαταρία και το τελευταίο σήμα.'] },
        { scene: 'lock', h: ['Where it was', 'Πού ήταν'], s: ['A card says in words where the vehicle was last seen: about 2 hours late, rounded to 1 km.', 'Η κάρτα λέει με λόγια πού φάνηκε τελευταία το όχημα: περίπου 2 ώρες πίσω, στρογγυλοποίηση 1 χλμ.'], c: ['On the road or Parked describes then, not now. This protects the students on board.', 'Το «Στον δρόμο» ή «Σταθμευμένο» περιγράφει τότε, όχι τώρα. Αυτό προστατεύει τους μαθητές.'] },
        { scene: 'chart', h: ['Open a vehicle', 'Άνοιξε ένα όχημα'], s: ['Press its name for a history chart of each reading over 24 hours, 7 days or 30 days.', 'Πάτα το όνομα για ιστορικό κάθε μέτρησης σε 24 ώρες, 7 ημέρες ή 30 ημέρες.'], c: ['Download CSV saves what you see as a spreadsheet file.', 'Το «Λήψη CSV» αποθηκεύει όσα βλέπεις σε αρχείο υπολογιστικού φύλλου.'] },
        { scene: 'clock', h: ['See the trips', 'Δες διαδρομές'], s: ['Press Follow one trip to replay one. The table of trips in the last 24 hours is rough.', 'Πάτα «Ακολουθήστε μια διαδρομή» για επανάληψη. Ο πίνακας διαδρομών 24 ωρών είναι χονδρικός.'] },
      ],
    },

    trip: {
      lead: ['Replay one day of one vehicle on the island, with a reading along the way. The past, never live.', 'Επανάλαβε μια ημέρα ενός οχήματος στο νησί, με μια μέτρηση στη διαδρομή. Είναι το παρελθόν, ποτέ ζωντανά.'],
      steps: [
        { scene: 'bus', h: ['Pick a trip', 'Διάλεξε διαδρομή'], s: ['Choose a Vehicle and a Day. Only vehicles with a GPS that moved appear here.', 'Διάλεξε Όχημα και Ημέρα. Εμφανίζονται μόνο οχήματα με GPS που κινήθηκαν.'] },
        { scene: 'clock', h: ['Press Play', 'Πάτα Αναπαραγωγή'], s: ['A dot replays the trip. Change the speed to 1×, 2× or 4×, or drag the slider to any moment.', 'Μια κουκκίδα επαναλαμβάνει τη διαδρομή. Άλλαξε ταχύτητα σε 1×, 2× ή 4× ή σύρε το ρυθμιστικό.'] },
        { scene: 'sensor', h: ['Pick a reading', 'Διάλεξε μέτρηση'], s: ['Choose Temperature, Humidity or CO2 to colour the route from the vehicle sensor.', 'Με Θερμοκρασία, Υγρασία ή CO2 η διαδρομή χρωματίζεται από τον αισθητήρα του ίδιου του οχήματος.'] },
        { scene: 'chart', h: ['Use the chart', 'Το γράφημα'], s: ['Click or drag on the chart to jump to that moment. See Highest, Lowest and the Average.', 'Πάτα ή σύρε στο γράφημα για να πας σε εκείνη τη στιγμή. Δες Υψηλότερη, Χαμηλότερη και Μέσο όρο.'] },
        { scene: 'lock', h: ['Not exact', 'Όχι ακριβές'], s: ['Positions are about 1 km out and at least 2 hours late. The dot glides straight, not along the road.', 'Οι θέσεις έχουν απόκλιση περίπου 1 χλμ. και καθυστέρηση τουλάχιστον 2 ωρών. Η κουκκίδα πάει ευθεία, όχι στον δρόμο.'] },
      ],
    },

    desk: {
      lead: ['A daily routine for your class: five checks, kept on this device only. Nobody signs in.', 'Μια καθημερινή ρουτίνα για την τάξη σου: πέντε έλεγχοι που μένουν μόνο σε αυτή τη συσκευή.'],
      steps: [
        { scene: 'flag', h: ['Five checks', 'Πέντε έλεγχοι'], s: ['The ring counts today’s checks. Press Start the next check to begin.', 'Ο κύκλος μετρά τους ελέγχους της ημέρας. Πάτα «Ξεκινήστε τον επόμενο έλεγχο» για να αρχίσεις.'], c: ['Finish all five to keep a streak of days. A new day starts at midnight, Cyprus time.', 'Ολοκλήρωσε και τους πέντε για να κρατήσεις σειρά ημερών. Η νέα ημέρα ξεκινά τα μεσάνυχτα, ώρα Κύπρου.'] },
        { scene: 'compare', h: ['Compare days', 'Σύγκρινε ημέρες'], s: ['Choose a School. Temperature, Humidity and CO2 are shown against the same time yesterday.', 'Διάλεξε Σχολείο. Θερμοκρασία, Υγρασία και CO2 δείχνονται δίπλα στην ίδια ώρα χθες.'] },
        { scene: 'sensor', h: ['Open pages', 'Άνοιξε σελίδες'], s: ['Three checks tick by themselves: a vehicle or school page, Sensor vs official, Met Office record.', 'Τρεις έλεγχοι συμπληρώνονται μόνοι: σελίδα οχήματος ή σχολείου, Αισθητήρας και επίσημος, Μετεωρολογικό αρχείο.'] },
        { scene: 'report', h: ['Write two', 'Γράψε δύο'], s: ['Answer today’s question and write one sentence about what changed. Press Save.', 'Απάντησε στην ερώτηση της ημέρας και γράψε μία πρόταση για το τι άλλαξε. Πάτα Αποθήκευση.'], c: ['Your words are saved on this device only. Nothing is sent anywhere.', 'Τα λόγια σου αποθηκεύονται μόνο σε αυτή τη συσκευή. Τίποτα δεν στέλνεται πουθενά.'] },
        { scene: 'chart', h: ['Over the day', 'Μέσα στην ημέρα'], s: ['Today from midnight is solid, yesterday dashed. The fourth chart is the nearest Met Office station.', 'Σήμερα από τα μεσάνυχτα με συνεχή γραμμή, χθες διακεκομμένη. Το τέταρτο γράφημα είναι σταθμός της Μετεωρολογικής.'] },
      ],
    },

    projects: {
      lead: ['Team projects in progress: a question, the sensors and data it uses, and how far the team has got.', 'Ομαδικά έργα σε εξέλιξη: ένα ερώτημα, οι αισθητήρες και τα δεδομένα του, και πόσο έχει προχωρήσει η ομάδα.'],
      steps: [
        { scene: 'people', h: ['See projects', 'Δες έργα'], s: ['Each card is a team’s question with a ring of steps done. Filter by All, Running or Done.', 'Κάθε κάρτα έχει ένα ερώτημα και έναν κύκλο με τα βήματα που έγιναν. Φίλτραρε με Όλα, Σε εξέλιξη ή Ολοκληρωμένα.'] },
        { scene: 'data', h: ['Open Details', 'Πάτα Λεπτομέρειες'], s: ['Details shows the steps, the Sensors it uses and the Data it reads.', 'Οι Λεπτομέρειες δείχνουν τα βήματα, τους Αισθητήρες που χρησιμοποιεί και τα Δεδομένα που διαβάζει.'] },
        { scene: 'lock', h: ['Teams only', 'Μόνο ομάδες'], s: ['Teams show by name, never students. Sensors show by name, never position.', 'Οι ομάδες εμφανίζονται με το όνομά τους, ποτέ οι μαθητές. Οι αισθητήρες ποτέ με τη θέση τους.'], c: ['Everyone sees only the projects a teacher approved.', 'Όλοι βλέπουν μόνο τα έργα που ενέκρινε εκπαιδευτικός.'] },
        { scene: 'flag', h: ['Your projects', 'Τα έργα σου'], s: ['Sign in to see your own plans and move them between Draft, Running and Done.', 'Συνδέσου για να δεις τα δικά σου σχέδια και να τα μετακινήσεις ανάμεσα σε Προσχέδιο, Σε εξέλιξη και Ολοκληρώθηκε.'] },
        { scene: 'share', h: ['Send it', 'Στείλε το'], s: ['Press Send to teacher when it is ready. A teacher checks it and may send it back with a note.', 'Πάτα «Αποστολή στον εκπαιδευτικό» όταν είναι έτοιμο. Θα το ελέγξει και ίσως το στείλει πίσω με σημείωμα.'] },
      ],
    },

    start: {
      lead: ['Turn a question into a project plan in four steps. Your draft stays in this browser until you create it.', 'Μετάτρεψε ένα ερώτημα σε σχέδιο έργου με τέσσερα βήματα. Το προσχέδιο μένει σε αυτό το πρόγραμμα περιήγησης.'],
      steps: [
        { scene: 'search', h: ['Your question', 'Το ερώτημά σου'], s: ['Write one question that numbers from a sensor can answer. A check shows if it is measurable.', 'Γράψε ένα ερώτημα που απαντιέται με αριθμούς από αισθητήρα. Ένας έλεγχος δείχνει αν είναι μετρήσιμο.'], c: ['Stuck? Press one of the Try one examples.', 'Δεν σου έρχεται κάτι; Πάτα ένα από τα παραδείγματα «Δοκιμάστε ένα».'] },
        { scene: 'sensor', h: ['Pick sensors', 'Διάλεξε αισθητήρες'], s: ['Choose from 1 to 6 sensors. They show by name, never by position.', 'Διάλεξε από 1 έως 6 αισθητήρες. Εμφανίζονται με το όνομά τους, ποτέ με τη θέση τους.'] },
        { scene: 'data', h: ['Pick data', 'Διάλεξε δεδομένα'], s: ['Choose readings. Add Met Office station or Outdoor air quality to compare. Suggestions are marked.', 'Διάλεξε μετρήσεις. Πρόσθεσε σταθμό ή ποιότητα αέρα έξω για σύγκριση. Τα προτεινόμενα σημειώνονται.'] },
        { scene: 'people', h: ['Name your team', 'Όνομα ομάδας'], s: ['Add a Team name and a Project name. Saving a plan needs an account: Join or sign in.', 'Βάλε Όνομα ομάδας και Όνομα έργου. Για να αποθηκευτεί το σχέδιο χρειάζεται λογαριασμός: «Εγγραφή ή σύνδεση».'], c: ['Use no real names, photos or exact places.', 'Χωρίς πραγματικά ονόματα, φωτογραφίες ή ακριβή σημεία.'] },
        { scene: 'check', h: ['Review', 'Έλεγχος'], s: ['Check the plan, then press Create the project. It is saved as a draft.', 'Έλεγξε το σχέδιο και πάτα «Δημιουργία του έργου». Αποθηκεύεται ως προσχέδιο.'], c: ['Only your team and teachers see it. Send it to a teacher from Running projects.', 'Το βλέπουν μόνο η ομάδα και οι εκπαιδευτικοί. Στείλε το σε εκπαιδευτικό από τα Ενεργά έργα.'] },
      ],
    },

  });
})();
