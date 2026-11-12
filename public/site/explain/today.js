/* Explainer content: today pages (home, board, city3d, alerts). Plain data, no logic. */
(function () {
  'use strict';
  window.SC = window.SC || {};
  SC.EXPLAIN = SC.EXPLAIN || {};
  Object.assign(SC.EXPLAIN, {
    home: {
      lead: ['Every page of Smart Cities sits in one of eight windows, in the order the data travels.', 'Κάθε σελίδα του Smart Cities βρίσκεται σε ένα από οκτώ παράθυρα, με τη σειρά που ταξιδεύουν τα δεδομένα.'],
      steps: [
        { scene: 'school', h: ['Light pillars', 'Στήλες φωτός'],
          s: ['Each light pillar is a school. A taller pillar means more of its sensors are online now.', 'Κάθε στήλη φωτός είναι ένα σχολείο. Όσο πιο ψηλή, τόσο περισσότεροι αισθητήρες του είναι σε λειτουργία τώρα.'],
          c: ['Copper dots are buses and cars, shown late and rounded to about 1 km to protect students.', 'Οι χάλκινες τελείες είναι λεωφορεία και αυτοκίνητα, με καθυστέρηση και στρογγυλοποίηση περίπου 1 χλμ. για προστασία των μαθητών.'] },
        { scene: 'data', h: ['Eight windows', 'Οκτώ παράθυρα'],
          s: ['Windows 1 to 8 run clockwise, in the order the data travels. Click one to jump to its box.', 'Τα παράθυρα 1 έως 8 πάνε δεξιόστροφα, με τη σειρά που ταξιδεύουν τα δεδομένα. Πάτα ένα για να πας στο πλαίσιό του.'],
          c: ['The stages: Sensors in, Check, Archive, The picture, Schools and teams, Think, Output, Oversight.', 'Τα στάδια: Αισθητήρες, Έλεγχος, Αρχείο, Η εικόνα, Σχολεία και ομάδες, Σκέψη, Παραγωγή, Εποπτεία.'] },
        { scene: 'search', h: ['Open a tool', 'Άνοιξε εργαλείο'],
          s: ['Each box holds the tools of its stage. Click a tool to open its page.', 'Κάθε πλαίσιο έχει τα εργαλεία του σταδίου. Πάτα ένα εργαλείο για να ανοίξει η σελίδα του.'],
          c: ['Box numbers are live unless a SAMPLE badge shows. Dim pictures are only sketches of what a page holds.', 'Οι αριθμοί στα πλαίσια είναι ζωντανοί, εκτός αν φαίνεται η ετικέτα ΔΕΙΓΜΑ. Οι αχνές εικόνες είναι μόνο σκίτσα.'] },
        { scene: 'lock', h: ['Who decides', 'Ποιος αποφασίζει'],
          s: ['A diamond marks the two gates, Check and Oversight, where a person decides.', 'Ένας ρόμβος σημαδεύει τις δύο πύλες, τον Έλεγχο και την Εποπτεία, όπου αποφασίζει άνθρωπος.'],
          c: ['Oversight opens only for teachers who sign in. Visitors never need an account.', 'Η Εποπτεία ανοίγει μόνο σε εκπαιδευτικούς που συνδέονται. Οι επισκέπτες δεν χρειάζονται λογαριασμό.'] },
        { scene: 'flag', h: ['Take the tour', 'Κάνε την ξενάγηση'],
          s: ['Under Tour mode, press Start. You visit six pages in order, from Cyprus 3D to Ask.', 'Στη γραμμή Ξενάγηση πάτα «Ξεκινήστε». Επισκέπτεσαι έξι σελίδες με τη σειρά, από την Κύπρο 3D ως το Ρωτήστε.'],
          c: ['Press Next to move on, or the close button to leave. The menu has the same route as Tour mode.', 'Πάτα «Επόμενο» για να προχωρήσεις ή το κουμπί κλεισίματος για έξοδο. Η ίδια διαδρομή υπάρχει στο μενού ως «Λειτουργία ξενάγησης».'] },
      ],
    },

    board: {
      lead: ['The project at a glance, from school sensors and the Met Office. A Sample numbers badge means demo data.', 'Το έργο με μια ματιά, από αισθητήρες σχολείων και Μετεωρολογική. Η ετικέτα «Δειγματικοί αριθμοί» σημαίνει επίδειξη.'],
      steps: [
        { scene: 'notice', h: ['Latest events', 'Τελευταία γεγονότα'],
          s: ['The strip at the top lists real changes only: a new warning or a sensor that went quiet.', 'Η λωρίδα στην κορυφή δείχνει μόνο πραγματικές αλλαγές: μια νέα προειδοποίηση ή έναν αισθητήρα που σίγησε.'],
          c: ['With no events, it says so. Every figure on the page links to its source.', 'Αν δεν υπάρχουν γεγονότα, το λέει. Κάθε στοιχείο της σελίδας οδηγεί στην πηγή του.'] },
        { scene: 'map', h: ['Pick a reading', 'Διάλεξε μέτρηση'],
          s: ['Press Temperature, CO2 or another chip. Each school’s column shows the average of its sensors.', 'Πάτα Θερμοκρασία, CO2 ή άλλο κουμπί. Η στήλη κάθε σχολείου δείχνει τον μέσο όρο των αισθητήρων του.'],
          c: ['Taller and copper means higher, blue means lower. Only readings from the last 3 hours count.', 'Πιο ψηλή και χάλκινη σημαίνει υψηλότερη μέτρηση, μπλε χαμηλότερη. Μετρούν μόνο οι τελευταίες 3 ώρες.'] },
        { scene: 'sensor', h: ['Sensors online', 'Ενεργοί αισθητήρες'],
          s: ['Online means a reading in the last hour. Quiet is over an hour of silence, Offline over a day.', 'Σε λειτουργία σημαίνει μέτρηση την τελευταία ώρα, σιωπηλός πάνω από μία ώρα, εκτός πάνω από μία ημέρα.'],
          c: ['Quiet sensors are usually parked or switched off. Moving or parked comes from delayed public positions.', 'Οι σιωπηλοί είναι συνήθως σταθμευμένοι ή κλειστοί. Το κινούμενο ή σταθμευμένο βγαίνει από δημόσιες θέσεις με καθυστέρηση.'] },
        { scene: 'weather', h: ['Four tiles', 'Τέσσερα πλακίδια'],
          s: ['Met Office warnings, Island temperature, Air quality · PM2.5 and Vehicles on the road.', 'Προειδοποιήσεις Μετεωρολογικής, Θερμοκρασία νησιού, Ποιότητα αέρα · PM2.5 και Οχήματα στον δρόμο.'],
          c: ['Island temperature is a Met Office average. If our sensors lack PM2.5, the air tile names its source.', 'Η θερμοκρασία νησιού είναι μέσος όρος της Μετεωρολογικής. Αν οι αισθητήρες μας δεν στέλνουν PM2.5, το πλακίδιο αέρα λέει την πηγή του.'] },
        { scene: 'compare', h: ['Last 24 hours', 'Τελευταίες 24 ώρες'],
          s: ['The chart puts our sensors’ temperature next to the Met Office stations nearest the schools.', 'Το γράφημα βάζει τη θερμοκρασία των αισθητήρων μας δίπλα στους σταθμούς της Μετεωρολογικής κοντά στα σχολεία.'],
          c: ['The lines need not match, since buses move. The grid below shows which hours every school reported.', 'Οι γραμμές δεν χρειάζεται να ταυτίζονται, τα λεωφορεία κινούνται. Το πλέγμα δείχνει ποιες ώρες έστειλαν όλα τα σχολεία.'] },
      ],
    },

    city3d: {
      lead: ['The island in 3D, with our sensors as columns. The pill at the top says how old the newest reading is.', 'Το νησί σε 3D, με τους αισθητήρες μας ως στήλες. Η ετικέτα στην κορυφή δείχνει πόσο παλιά είναι η νεότερη μέτρηση.'],
      steps: [
        { scene: 'globe', h: ['Drag and zoom', 'Σύρε και μεγέθυνε'],
          s: ['Drag to turn the island, scroll to zoom. Press Whole island to fly back to the start view.', 'Σύρε για να γυρίσεις το νησί, κύλησε για μεγέθυνση. Πάτα «Όλο το νησί» για να γυρίσεις στην αρχική θέα.'],
          c: ['Press Tour and the island turns by itself. Touch it and the tour stops.', 'Πάτα «Περιήγηση» και το νησί γυρίζει μόνο του. Όταν το αγγίξεις, σταματά.'] },
        { scene: 'weather', h: ['Pick a layer', 'Διάλεξε στρώμα'],
          s: ['In the panel on the left, colour the ground by Island, Temperature, Elevation, Air quality or Dust.', 'Στο πάνελ αριστερά χρωμάτισε το έδαφος με Νησί, Θερμοκρασία, Υψόμετρο, Ποιότητα αέρα ή Σκόνη.'],
          c: ['Temperature, air quality and dust come from a weather model (Open-Meteo), not from our sensors.', 'Η θερμοκρασία, ο αέρας και η σκόνη προέρχονται από μοντέλο καιρού (Open-Meteo), όχι από τους αισθητήρες μας.'] },
        { scene: 'air', h: ['Add layers', 'Πρόσθεσε στρώματα'],
          s: ['Switch on Wind, Clouds and rain or Sea conditions to see them on the island.', 'Ενεργοποίησε Άνεμος, Σύννεφα και βροχή ή Συνθήκες θάλασσας για να τα δεις στο νησί.'],
          c: ['The Height of mountains slider stretches the relief on purpose, so mountains look taller than they are.', 'Το ρυθμιστικό «Ύψος βουνών» τεντώνει το ανάγλυφο επίτηδες, γι’ αυτό τα βουνά φαίνονται ψηλότερα.'] },
        { scene: 'sensor', h: ['Sensor columns', 'Στήλες αισθητήρων'],
          s: ['Column height shows the reading. Under Sensor columns show, pick which reading to follow.', 'Το ύψος της στήλης δείχνει τη μέτρηση. Στο «Οι στήλες δείχνουν» διάλεξε ποια μέτρηση θες.'],
          c: ['Vehicle columns stand at delayed, rounded positions. Teachers see exact ones after signing in.', 'Οι στήλες των οχημάτων είναι σε θέσεις με καθυστέρηση και στρογγυλοποίηση. Οι εκπαιδευτικοί βλέπουν τις ακριβείς μετά τη σύνδεση.'] },
        { scene: 'search', h: ['Open a sensor', 'Άνοιξε αισθητήρα'],
          s: ['Press a sensor in the right-hand list to fly to its column. Press a column to open its page.', 'Πάτα έναν αισθητήρα στη λίστα δεξιά για να πετάξεις στη στήλη του. Πάτα μια στήλη για να ανοίξει η σελίδα του.'],
          c: ['Sort the list by Highest first, Lowest first or By name. Sensor list in the panel hides it.', 'Ταξινόμησε τη λίστα με Πρώτες οι υψηλότερες, Πρώτες οι χαμηλότερες ή Ανά όνομα. Το «Λίστα αισθητήρων» την κρύβει.'] },
      ],
    },

    alerts: {
      lead: ['A rule fires an alert when a reading crosses a line. Every alert shows its rule, source and time.', 'Ένας κανόνας δίνει ειδοποίηση όταν μια μέτρηση περνά ένα όριο. Κάθε ειδοποίηση δείχνει κανόνα, πηγή και ώρα.'],
      steps: [
        { scene: 'alert', h: ['Pick a level', 'Διάλεξε επίπεδο'],
          s: ['Three tiles count the alerts: High, Medium and Info. Press one to show only that level.', 'Τρία πλακίδια μετρούν τις ειδοποιήσεις: Υψηλό, Μεσαίο και Πληροφορία. Πάτα ένα για να δεις μόνο αυτό το επίπεδο.'],
          c: ['High: look today. Medium: check within the school day. Info: good to know, no action today.', 'Υψηλό: δες το σήμερα. Μεσαίο: έλεγξε μέσα στη σχολική ημέρα. Πληροφορία: καλό να το ξέρεις, χωρίς ενέργεια.'] },
        { scene: 'sliders', h: ['Filter alerts', 'Φίλτρα'],
          s: ['Choose All, Air, Weather or Sensors, then a School. Highest level first, then newest.', 'Διάλεξε Όλες, Αέρας, Καιρός ή Αισθητήρες και ένα Σχολείο. Πρώτα το υψηλότερο επίπεδο, μετά οι νεότερες.'] },
        { scene: 'chart', h: ['Read a card', 'Διάβασε μια κάρτα'],
          s: ['Each card shows the Rule, Line, Source and Time, usually with a small chart of the readings.', 'Κάθε κάρτα δείχνει Κανόνα, Όριο, Πηγή και Ώρα, συνήθως με ένα μικρό γράφημα των μετρήσεων.'],
          c: ['Open Why this alert for the reason. Places show only as a rough distance from a school.', 'Άνοιξε το «Γιατί αυτή η ειδοποίηση» για τον λόγο. Οι θέσεις φαίνονται μόνο ως περίπου απόσταση από σχολείο.'] },
        { scene: 'book', h: ['See the rules', 'Δες τους κανόνες'],
          s: ['The rules table lists every line and its level. Each rule shows Clear, how many are open, or Off.', 'Ο πίνακας «Οι κανόνες» δείχνει κάθε όριο και επίπεδο. Κάθε κανόνας γράφει Καθαρός, πόσες είναι ανοιχτές ή Ανενεργός.'],
          c: ['Teachers write the rules and can change the lines in Settings. A rule never names a person.', 'Οι κανόνες γράφονται από εκπαιδευτικούς, που αλλάζουν τα όρια στις Ρυθμίσεις. Ένας κανόνας δεν κατονομάζει ποτέ πρόσωπο.'] },
        { scene: 'clock', h: ['Check and mute', 'Έλεγχος, σίγαση'],
          s: ['It re-checks every minute, or press Check now. Mute for a day hides an alert on this device only.', 'Ελέγχει ξανά κάθε λεπτό, ή πάτα «Έλεγχος τώρα». Η «Σίγαση για μία ημέρα» κρύβει μια ειδοποίηση μόνο σε αυτή τη συσκευή.'],
          c: ['A muted alert comes back after 24 hours. Ended alerts stay listed for another 24 hours.', 'Μια ειδοποίηση σε σίγαση επανέρχεται μετά από 24 ώρες. Οι ειδοποιήσεις που έληξαν μένουν στη λίστα 24 ώρες.'] },
      ],
    },
  });
})();
