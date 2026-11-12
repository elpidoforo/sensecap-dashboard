/* Explainer content: schools pages (join, schools, districts, guides). Plain data, no logic. */
(function () {
  'use strict';
  window.SC = window.SC || {};
  SC.EXPLAIN = SC.EXPLAIN || {};
  Object.assign(SC.EXPLAIN, {
    join: {
      lead: ['Make your own account with your city and team. A teacher or an admin approves it. No email, no class code.',
        'Φτιάξε τον δικό σου λογαριασμό με πόλη και ομάδα. Τον εγκρίνει εκπαιδευτικός ή διαχειριστής. Χωρίς email και κωδικό τάξης.'],
      steps: [
        { scene: 'school', h: ['Pick your city', 'Διάλεξε πόλη'],
          s: ['Under “Your city”, press the school you belong to.', 'Στο «Η πόλη σας» πάτα το σχολείο στο οποίο ανήκεις.'],
          c: ['If you picked the wrong one, press another.', 'Αν διάλεξες λάθος, πάτα ένα άλλο.'] },
        { scene: 'people', h: ['Pick your team', 'Διάλεξε ομάδα'],
          s: ['Press your team under “Your team”. If it is missing, press “+ My team is not here”.', 'Πάτα την ομάδα σου στο «Η ομάδα σας». Αν λείπει, πάτα «+ Η ομάδα μου δεν υπάρχει».'],
          c: ['Type the name of a new team and a teacher confirms it. Use a name your class knows, never a real name.', 'Γράψε το όνομα της νέας ομάδας και την επιβεβαιώνει εκπαιδευτικός. Χωρίς πραγματικά ονόματα.'] },
        { scene: 'lock', h: ['Name, password', 'Όνομα, κωδικός'],
          s: ['Type a first name and an initial under “Display name”, then a password of at least 8 characters.', 'Γράψε μικρό όνομα και αρχικό στο «Όνομα εμφάνισης» και έναν κωδικό τουλάχιστον 8 χαρακτήρων.'],
          c: ['No surname, no photo, no email. If you lose the password, a teacher gives you a temporary one.', 'Χωρίς επώνυμο, φωτογραφία ή email. Αν χάσεις τον κωδικό, ο εκπαιδευτικός σού δίνει προσωρινό.'] },
        { scene: 'share', h: ['Ask to join', 'Στείλε αίτημα'],
          s: ['Tick the box that says you understand how the site works, then press “Ask to join”.', 'Επίλεξε το πλαίσιο ότι καταλαβαίνεις πώς λειτουργεί ο ιστότοπος και πάτα «Αίτημα συμμετοχής».'],
          c: ['The box says a teacher checks every tool you build before anyone else can open it.', 'Το πλαίσιο λέει ότι ένας εκπαιδευτικός ελέγχει κάθε εργαλείο που φτιάχνεις πριν το ανοίξει άλλος.'] },
        { scene: 'clock', h: ['Get approved', 'Περίμενε έγκριση'],
          s: ['You reach a waiting page that updates by itself. Look around the whole site meanwhile.', 'Φτάνεις σε σελίδα αναμονής που ενημερώνεται μόνη της. Στο μεταξύ δες όλον τον ιστότοπο.'],
          c: ['When a teacher or an admin approves you, the Build studio opens. Already have an account? Use “Sign in”.', 'Μόλις σε εγκρίνει εκπαιδευτικός ή διαχειριστής, ανοίγει το Στούντιο. Αν έχεις ήδη λογαριασμό, πάτα «Σύνδεση».'] },
      ],
    },

    schools: {
      lead: ['See the four schools, their teams and the sensor each team carries. Teams show by name, never by student.',
        'Δες τα τέσσερα σχολεία, τις ομάδες τους και τον αισθητήρα που φέρει η καθεμία. Μόνο ονόματα ομάδων, ποτέ μαθητών.'],
      steps: [
        { scene: 'school', h: ['Pick a school', 'Διάλεξε σχολείο'],
          s: ['Each card is one school. Press “See the … teams”, or a name in the filter, to see just its teams.', 'Κάθε κάρτα είναι ένα σχολείο. Πάτα «Δείτε τις … ομάδες» ή ένα όνομα στο φίλτρο για να δεις μόνο τις ομάδες του.'],
          c: ['Each card also shows how many sensors are online and how many vehicles carry sensors.', 'Η κάρτα δείχνει και πόσοι αισθητήρες λειτουργούν και πόσα οχήματα έχουν αισθητήρες.'] },
        { scene: 'search', h: ['Find a team', 'Βρες ομάδα'],
          s: ['Type in the search box, choose a “Topic”, or tick “Fresh data only”.', 'Γράψε στην αναζήτηση, διάλεξε «Θέμα» ή επίλεξε «Μόνο πρόσφατα δεδομένα».'],
          c: ['A topic is what a team’s sensor measures. Search also looks in the questions teams shared.', 'Θέμα είναι αυτό που μετρά ο αισθητήρας μιας ομάδας. Η αναζήτηση ψάχνει και στις ερωτήσεις των ομάδων.'] },
        { scene: 'sensor', h: ['Open a team', 'Άνοιξε ομάδα'],
          s: ['Press a team name. “Overview” shows “Our question”, the latest readings and a chart of today.', 'Πάτα το όνομα μιας ομάδας. Η «Επισκόπηση» δείχνει «Η ερώτησή μας», τις τελευταίες μετρήσεις και γράφημα της μέρας.'],
          c: ['The summary under the chart is worked out from saved readings, not written by the team.', 'Η περίληψη κάτω από το γράφημα υπολογίζεται από αποθηκευμένες μετρήσεις, δεν τη γράφει η ομάδα.'] },
        { scene: 'chart', h: ['Check the data', 'Έλεγξε δεδομένα'],
          s: ['Open “Data”. Pick a reading to chart over 24 hours, then read the table of latest values.', 'Άνοιξε τα «Δεδομένα». Διάλεξε μια μέτρηση για γράφημα 24 ωρών και δες τον πίνακα με τις τελευταίες τιμές.'],
          c: ['Vehicle positions are always shown late and rounded, so no vehicle can be followed.', 'Οι θέσεις των οχημάτων φαίνονται πάντα με καθυστέρηση και στρογγυλεμένες, οπότε κανένα όχημα δεν ακολουθείται.'] },
        { scene: 'build', h: ['See projects', 'Δες έργα'],
          s: ['Open “Projects” to see pages this team built in the Build studio and a teacher approved.', 'Άνοιξε τα «Έργα» για σελίδες που έφτιαξε η ομάδα στο Στούντιο και ενέκρινε εκπαιδευτικός.'],
          c: ['No project yet? Press “Open the Build studio”. It opens once your account is approved.', 'Δεν υπάρχει έργο; Πάτα «Άνοιγμα του Στούντιο». Ανοίγει μόλις εγκριθεί ο λογαριασμός σου.'] },
      ],
    },

    districts: {
      lead: ['Compare four districts: school sensors next to Met Office stations, then 1 km route squares.',
        'Σύγκρινε τέσσερις επαρχίες: αισθητήρες σχολείων δίπλα σε σταθμούς της Μετεωρολογικής και τετράγωνα διαδρομής 1 χλμ.'],
      steps: [
        { scene: 'map', h: ['Pick district', 'Διάλεξε επαρχία'],
          s: ['Press a district on “The island” map, or use the district names under it.', 'Πάτα μια επαρχία στον χάρτη «Το νησί» ή ένα όνομα επαρχίας κάτω από αυτόν.'],
          c: ['Big dots are schools, small dots are Met Office stations. The page below follows your pick.', 'Οι μεγάλες τελείες είναι σχολεία, οι μικρές σταθμοί της Μετεωρολογικής. Η σελίδα ακολουθεί την επιλογή σου.'] },
        { scene: 'compare', h: ['Compare bars', 'Σύγκρινε μπάρες'],
          s: ['Choose Temperature, Humidity or CO2, then compare “School sensors” with “Met Office stations”.', 'Διάλεξε Θερμοκρασία, Υγρασία ή CO2 και σύγκρινε «Αισθητήρες σχολείου» με «Σταθμούς Μετεωρολογικής».'],
          c: ['A school sensor reads the air around a vehicle or room, a station is outdoors. A gap is a question, not an error.', 'Ο αισθητήρας σχολείου μετρά τον αέρα ενός οχήματος ή αίθουσας, ο σταθμός είναι στο ύπαιθρο. Μια διαφορά είναι ερώτηση, όχι λάθος.'] },
        { scene: 'weather', h: ['Read stations', 'Δες σταθμούς'],
          s: ['Scroll to the Met Office stations of that district. Each row has its temperature, humidity and time.', 'Κατέβα στους σταθμούς της Μετεωρολογικής της επαρχίας. Κάθε γραμμή έχει θερμοκρασία, υγρασία και ώρα.'],
          c: ['A station belongs to the district whose shape holds it. That is our own rule, not an official boundary.', 'Ένας σταθμός ανήκει στην επαρχία που τον περιέχει στον χάρτη. Είναι δικός μας κανόνας, όχι επίσημο όριο.'] },
        { scene: 'bus', h: ['Route squares', 'Τετράγωνα'],
          s: ['Open “Route squares”. Each 1 km square shows where school vehicles drove in the last 24 hours.', 'Άνοιξε τα «Τετράγωνα διαδρομής». Κάθε τετράγωνο 1 χλμ δείχνει πού πήγαν τα οχήματα το τελευταίο 24ωρο.'],
          c: ['Squares are built from points at least 2 hours old, grouped so no single vehicle can be followed.', 'Τα τετράγωνα φτιάχνονται από σημεία παλαιότερα των 2 ωρών, ομαδοποιημένα ώστε κανένα όχημα να μην ακολουθείται.'] },
        { scene: 'sliders', h: ['Colour, zoom', 'Χρώμα, εστίαση'],
          s: ['Colour by Visits, Temperature, Humidity or CO2. Zoom to a district, then press a square to read it.', 'Χρωμάτισε ανά Επισκέψεις, Θερμοκρασία, Υγρασία ή CO2. Εστίασε σε μια επαρχία και πάτα ένα τετράγωνο.'],
          c: ['A square has no name and no position. It shows only its district, its visits and an average.', 'Ένα τετράγωνο δεν έχει όνομα ούτε θέση. Δείχνει μόνο την επαρχία, τις επισκέψεις και έναν μέσο όρο.'] },
      ],
    },

    guides: {
      lead: ['One sheet per kind of sensor: what it measures, what is normal, and what our own sensors read now.',
        'Ένα φύλλο για κάθε είδος αισθητήρα: τι μετρά, τι είναι φυσιολογικό και τι διαβάζουν τώρα οι δικοί μας.'],
      steps: [
        { scene: 'sensor', h: ['Pick a card', 'Διάλεξε κάρτα'],
          s: ['Each card is one kind of sensor, with a short line about what it measures.', 'Κάθε κάρτα είναι ένα είδος αισθητήρα, με μια σύντομη γραμμή για το τι μετρά.'] },
        { scene: 'data', h: ['Read the range', 'Δες το εύρος'],
          s: ['“Our sensors now” shows the range our sensors read in the last 3 hours.', 'Το «Οι αισθητήρες μας τώρα» δείχνει το εύρος των μετρήσεων των τελευταίων 3 ωρών.'],
          c: ['Some things our sensors do not measure, and the card says so. Old readings show how old they are.', 'Κάποια πράγματα οι αισθητήρες μας δεν τα μετρούν και η κάρτα το λέει. Οι παλιές μετρήσεις δείχνουν πόσο παλιές είναι.'] },
        { scene: 'book', h: ['Open the sheet', 'Άνοιξε το φύλλο'],
          s: ['Press “Open the sheet” to read what it measures, its normal range and common mistakes.', 'Πάτα «Άνοιγμα φύλλου» για να διαβάσεις τι μετρά, το κανονικό εύρος και τα συνηθισμένα λάθη.'],
          c: ['Teachers write the sheets in the handbook. The assistant reads the same pages.', 'Τα φύλλα τα γράφουν εκπαιδευτικοί στο εγχειρίδιο. Τις ίδιες σελίδες τις διαβάζει και ο βοηθός.'] },
        { scene: 'compare', h: ['Compare', 'Σύγκρινε'],
          s: ['Compare the sheet’s normal range with the reading of each of our sensors, listed at the top.', 'Σύγκρινε το κανονικό εύρος του φύλλου με τη μέτρηση κάθε αισθητήρα μας, που αναφέρεται στην κορυφή.'],
          c: ['Vehicle sensors read the air around the vehicle. Sun, an open window or people change the numbers.', 'Οι αισθητήρες οχημάτων μετρούν τον αέρα γύρω από το όχημα. Ο ήλιος, ένα ανοιχτό παράθυρο ή οι άνθρωποι αλλάζουν τους αριθμούς.'] },
        { scene: 'search', h: ['Ask or explore', 'Ρώτα ή ψάξε'],
          s: ['Press “Ask the assistant” to open it with a question about this sensor already typed in.', 'Πάτα «Ρωτήστε τον βοηθό» για να ανοίξει με μια ερώτηση για αυτόν τον αισθητήρα ήδη γραμμένη.'],
          c: ['You can change the question first. “Open in the library” shows the same guide there.', 'Μπορείς πρώτα να αλλάξεις την ερώτηση. Το «Άνοιγμα στη βιβλιοθήκη» δείχνει τον ίδιο οδηγό εκεί.'] },
      ],
    },
  });
})();
