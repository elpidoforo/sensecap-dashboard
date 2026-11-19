/* The project's knowledge base: what Smart Cities is, who takes part, what students do and why. Plain data, no logic.
   ONE file, read in two places, so the page and the assistant can never say different things:
     - the page "About the project" (public/site/pages/about.js) shows it;
     - the server (guide-knowledge.js) reads it in an empty sandbox and gives it to Kleanthis as what he knows about the project.
   Sources: the project's two presentations by the project leader: "Cyprus, The Living Smart-City Classroom" (12 slides) and
   "Cyprus AI Sustainable Cities" (10 slides, the later one; where the two differ, the later one is followed).
   What is NOT here, on purpose: the example numbers, forecast scores, news headlines and quotes drawn on the slides. Those are
   pictures of what a result could look like, not results. A real reading is only ever shown by the site, with its time and source.
   Every entry is [English, Greek]. Greek is informal singular. To change what the project says about itself, change it here. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  SC.PROJECT = {
    source: ['From the two project presentations, "Cyprus, The Living Smart-City Classroom" and "Cyprus AI Sustainable Cities".', 'Από τις δύο παρουσιάσεις του έργου, «Cyprus, The Living Smart-City Classroom» και «Cyprus AI Sustainable Cities».'],
    name: ['Smart Cities (AI Sustainable Cities)', 'Έξυπνες Πόλεις (AI Sustainable Cities)'],
    platform: ['This website is the project\'s data platform. Its name is Kleanthis, and Kleanthis is also the name of its AI guide.', 'Αυτός ο ιστότοπος είναι η πλατφόρμα δεδομένων του έργου. Λέγεται Κλεάνθης, και Κλεάνθης λέγεται και ο οδηγός του με τεχνητή νοημοσύνη.'],
    mission: {
      title: ['Creating a smarter Cyprus, starting from education', 'Μια πιο έξυπνη Κύπρος, με αφετηρία την εκπαίδευση'],
      tag: ['Four schools. Four cities. One data mission.', 'Τέσσερα σχολεία. Τέσσερις πόλεις. Μία αποστολή δεδομένων.'],
      motto: ['Cyprus, measured by students. Improved through learning.', 'Η Κύπρος, μετρημένη από μαθητές. Καλύτερη μέσα από τη μάθηση.'],
      what: ['Students in four cities collect real environmental data from their own streets, add what satellites see from space, use AI to look for patterns, and explain what it means for a cleaner, healthier city.',
        'Μαθητές σε τέσσερις πόλεις συλλέγουν πραγματικά περιβαλλοντικά δεδομένα από τους δρόμους τους, προσθέτουν όσα βλέπουν οι δορυφόροι από το διάστημα, ψάχνουν μοτίβα με την τεχνητή νοημοσύνη και εξηγούν τι σημαίνουν για μια πιο καθαρή και υγιή πόλη.'],
      why: ['Every city becomes a learning lab: the place where you live is the thing you study, with real data instead of textbook examples.',
        'Κάθε πόλη γίνεται εργαστήρι μάθησης: ο τόπος όπου ζεις είναι αυτό που μελετάς, με πραγματικά δεδομένα αντί για παραδείγματα βιβλίου.'],
      created: ['Why the platform was created: so that students do not only learn about sustainability. They measure it, model it and explain it to their city.', 'Γιατί δημιουργήθηκε η πλατφόρμα: για να μη μαθαίνουν απλώς οι μαθητές για τη βιωσιμότητα. Τη μετρούν, τη μοντελοποιούν και την εξηγούν στην πόλη τους.'],
      vision: ['The vision: a smarter, more sustainable Cyprus that starts in school, where students across the island collect, connect and explain city data together.', 'Το όραμα: μια πιο έξυπνη και βιώσιμη Κύπρος που ξεκινά από το σχολείο, όπου μαθητές σε όλο το νησί συλλέγουν, συνδέουν και εξηγούν μαζί τα δεδομένα της πόλης.'],
      yours: ['Explore the data, ask questions, and explain to your city what you find.', 'Εξερεύνησε τα δεδομένα, κάνε ερωτήσεις και εξήγησε στην πόλη σου τι βρήκες.'],
      promise: ['The promise to students: you become a data collector, an AI analyst, a space observer, a sustainability thinker and a city storyteller.', 'Η υπόσχεση προς τους μαθητές: γίνεσαι συλλέκτης δεδομένων, αναλυτής τεχνητής νοημοσύνης, παρατηρητής του διαστήματος, στοχαστής της βιωσιμότητας και αφηγητής της πόλης.'],
    },
    schools: [
      { name: ['PASCAL English School Larnaka', 'PASCAL English School Λάρνακα'], city: ['Larnaka', 'Λάρνακα'] },
      { name: ['PASCAL English School Lefkosia', 'PASCAL English School Λευκωσία'], city: ['Lefkosia (Nicosia)', 'Λευκωσία'] },
      { name: ['PASCAL English School Limassol', 'PASCAL English School Λεμεσός'], city: ['Limassol', 'Λεμεσός'] },
      { name: ['International School of Paphos', 'International School of Paphos'], city: ['Paphos', 'Πάφος'] },
    ],
    people: [
      ['Each school forms a team of at least five upper-school students.', 'Κάθε σχολείο σχηματίζει μια ομάδα από τουλάχιστον πέντε μαθητές των μεγάλων τάξεων.'],
      ['Lower-school students take part as junior explorers.', 'Οι μικρότεροι μαθητές συμμετέχουν ως μικροί εξερευνητές.'],
      ['In each school a STEAM coordinator leads the work locally, with the school\'s leadership.', 'Σε κάθε σχολείο ένας συντονιστής STEAM καθοδηγεί τη δουλειά, μαζί με τη διεύθυνση του σχολείου.'],
      ['The project leader is Elpidoforos Anastasiou. The four schools are equal partners: they form one student data network across the island.', 'Υπεύθυνος του έργου είναι ο Ελπιδοφόρος Αναστασίου. Τα τέσσερα σχολεία είναι ισότιμοι συνεργάτες: σχηματίζουν ένα μαθητικό δίκτυο δεδομένων σε όλο το νησί.'],
    ],
    roles: [
      { icon: 'sensor', name: ['Sensor Engineer', 'Μηχανικός αισθητήρων'], does: ['Sets up the sensors and checks that they measure correctly.', 'Στήνει τους αισθητήρες και ελέγχει ότι μετρούν σωστά.'] },
      { icon: 'db', name: ['Data Scientist', 'Επιστήμονας δεδομένων'], does: ['Collects, organises and analyses the data.', 'Συλλέγει, οργανώνει και αναλύει τα δεδομένα.'] },
      { icon: 'sparkle', name: ['AI Analyst', 'Αναλυτής τεχνητής νοημοσύνης'], does: ['Uses AI to find patterns, and checks whether they hold.', 'Χρησιμοποιεί την τεχνητή νοημοσύνη για να βρει μοτίβα και ελέγχει αν ισχύουν.'] },
      { icon: 'globe', name: ['Satellite Observer', 'Παρατηρητής δορυφόρων'], does: ['Watches the Earth from space with satellite data.', 'Παρατηρεί τη Γη από το διάστημα με δορυφορικά δεδομένα.'] },
      { icon: 'flag', name: ['City Storyteller', 'Αφηγητής της πόλης'], does: ['Turns the findings into a story that people understand and act on.', 'Κάνει τα ευρήματα μια ιστορία που οι άνθρωποι καταλαβαίνουν και τους κινεί να δράσουν.'] },
    ],
    steps: [
      { name: ['Place sensors', 'Τοποθέτησε αισθητήρες'], does: ['Students install or carry approved sensors on buses, cars or school routes.', 'Οι μαθητές τοποθετούν ή μεταφέρουν εγκεκριμένους αισθητήρες σε λεωφορεία, αυτοκίνητα ή σχολικές διαδρομές.'] },
      { name: ['Collect data', 'Σύλλεξε δεδομένα'], does: ['Each route becomes a moving experiment: the sensors record temperature, humidity and air-quality indicators along the way. Every journey becomes a science experiment.', 'Κάθε διαδρομή γίνεται ένα κινούμενο πείραμα: οι αισθητήρες καταγράφουν θερμοκρασία, υγρασία και δείκτες ποιότητας αέρα στη διαδρομή. Κάθε διαδρομή γίνεται ένα πείραμα.'] },
      { name: ['Add the space view', 'Πρόσθεσε τη ματιά από το διάστημα'], does: ['Satellite images and map layers let students compare what happens in one street with what happens across the whole city.', 'Οι δορυφορικές εικόνες και τα στρώματα του χάρτη βοηθούν τους μαθητές να συγκρίνουν ό,τι γίνεται σε έναν δρόμο με ό,τι γίνεται σε όλη την πόλη.'] },
      { name: ['Use AI', 'Χρησιμοποίησε την τεχνητή νοημοσύνη'], does: ['AI helps to find patterns, compare areas and estimate what may happen next. Students check those estimates against what is measured later, and interpret them responsibly.', 'Η τεχνητή νοημοσύνη βοηθά να βρεις μοτίβα, να συγκρίνεις περιοχές και να εκτιμήσεις τι μπορεί να ακολουθήσει. Οι μαθητές ελέγχουν αυτές τις εκτιμήσεις με όσα μετρηθούν αργότερα και τις ερμηνεύουν υπεύθυνα.'] },
      { name: ['Present evidence', 'Παρουσίασε τα στοιχεία'], does: ['Students explain what they found, and what it means for a cleaner, healthier city, to their school, their municipality and a wider audience.', 'Οι μαθητές εξηγούν τι βρήκαν, και τι σημαίνει για μια πιο καθαρή και υγιή πόλη, στο σχολείο τους, στον δήμο τους και σε ευρύτερο κοινό.'] },
    ],
    learn: [
      { name: ['STEAM', 'STEAM'], does: ['Science, technology, engineering, arts and mathematics meet in one real challenge.', 'Επιστήμη, τεχνολογία, μηχανική, τέχνες και μαθηματικά συναντιούνται σε μια πραγματική πρόκληση.'] },
      { name: ['Sensors', 'Αισθητήρες'], does: ['You understand how a sensor captures evidence from the real world.', 'Καταλαβαίνεις πώς ένας αισθητήρας καταγράφει στοιχεία από τον πραγματικό κόσμο.'] },
      { name: ['AI', 'Τεχνητή νοημοσύνη'], does: ['You learn prediction, interpretation and responsible AI thinking.', 'Μαθαίνεις πρόβλεψη, ερμηνεία και υπεύθυνη σκέψη για την τεχνητή νοημοσύνη.'] },
      { name: ['Space data', 'Δεδομένα από το διάστημα'], does: ['Satellite observations connect the study of your city with space education.', 'Οι δορυφορικές παρατηρήσεις συνδέουν τη μελέτη της πόλης σου με την εκπαίδευση για το διάστημα.'] },
      { name: ['Sustainability', 'Βιωσιμότητα'], does: ['You investigate climate, environment, routes and the patterns of a city.', 'Ερευνάς το κλίμα, το περιβάλλον, τις διαδρομές και τα μοτίβα μιας πόλης.'] },
      { name: ['Communication', 'Επικοινωνία'], does: ['You become a storyteller who explains complex evidence clearly.', 'Γίνεσαι αφηγητής που εξηγεί καθαρά σύνθετα στοιχεία.'] },
    ],
    responsible: {
      motto: ['AI informs. People decide.', 'Η τεχνητή νοημοσύνη ενημερώνει. Οι άνθρωποι αποφασίζουν.'],
      rules: [
        { name: ['Quality', 'Ποιότητα'], does: ['Use reliable data and check a model before you trust it.', 'Χρησιμοποίησε αξιόπιστα δεδομένα και έλεγξε ένα μοντέλο πριν το εμπιστευτείς.'] },
        { name: ['Privacy', 'Ιδιωτικότητα'], does: ['Protect people and sensitive data.', 'Προστάτεψε τους ανθρώπους και τα ευαίσθητα δεδομένα.'] },
        { name: ['Bias', 'Μεροληψία'], does: ['Look for results that are unfair or leave someone out.', 'Ψάξε για αποτελέσματα που είναι άδικα ή αφήνουν κάποιον έξω.'] },
        { name: ['Judgment', 'Κρίση'], does: ['A person makes the final call, not the machine.', 'Την τελική απόφαση την παίρνει άνθρωπος, όχι η μηχανή.'] },
      ],
    },
    goals: [
      { name: ['IB and final-year projects', 'Εργασίες IB και τελευταίας τάξης'], does: ['The project gives a real challenge, real data, real tools and a real audience: a strong base for an IB or final-year project and for a university application.', 'Το έργο δίνει πραγματική πρόκληση, πραγματικά δεδομένα, πραγματικά εργαλεία και πραγματικό κοινό: γερή βάση για μια εργασία IB ή τελευταίας τάξης και για μια αίτηση σε πανεπιστήμιο.'] },
      { name: ['Students present to their city', 'Οι μαθητές παρουσιάζουν στην πόλη τους'], does: ['The aim is to invite each municipality, so that student teams present their measurements, maps and questions to the mayor and local leaders. Schools become partners of their city.', 'Στόχος είναι να προσκληθεί κάθε δήμος, ώστε οι ομάδες των μαθητών να παρουσιάσουν τις μετρήσεις, τους χάρτες και τις ερωτήσεις τους στον δήμαρχο και στους τοπικούς φορείς. Τα σχολεία γίνονται συνεργάτες της πόλης τους.'] },
      { name: ['Learning becomes public value', 'Η μάθηση γίνεται δημόσιο όφελος'], does: ['What the project hopes for: cleaner air, lower energy use, healthier communities and a greener future. These are aims, not results yet.', 'Αυτά που ελπίζει το έργο: καθαρότερος αέρας, λιγότερη κατανάλωση ενέργειας, πιο υγιείς κοινότητες και πιο πράσινο μέλλον. Είναι στόχοι, όχι ακόμη αποτελέσματα.'] },
    ],
    launch: {
      when: ['The project began in October, after the busy weeks when schools open, with school visits by the project leader.', 'Το έργο ξεκίνησε τον Οκτώβριο, μετά τις γεμάτες εβδομάδες της έναρξης των σχολείων, με επισκέψεις του υπεύθυνου του έργου στα σχολεία.'],
      steps: [
        ['Confirm the participating schools and their cities', 'Επιβεβαίωση των σχολείων που συμμετέχουν και των πόλεών τους'],
        ['Each school names its STEAM coordinator', 'Κάθε σχολείο ορίζει τον συντονιστή STEAM'],
        ['Choose the student teams and the approved sensor routes', 'Επιλογή των μαθητικών ομάδων και των εγκεκριμένων διαδρομών'],
        ['School visits introduce the project and start the network', 'Οι επισκέψεις στα σχολεία παρουσιάζουν το έργο και ξεκινούν το δίκτυο'],
      ],
    },
    honest: [
      ['The pictures in the presentation show example numbers. They are not measurements.', 'Οι εικόνες της παρουσίασης δείχνουν παραδείγματα αριθμών. Δεν είναι μετρήσεις.'],
      ['A real reading is only what this site shows, with its unit, its time and where it came from.', 'Πραγματική μέτρηση είναι μόνο ό,τι δείχνει αυτός ο ιστότοπος, με τη μονάδα, την ώρα και την πηγή του.'],
      ['Two things that change together are not proof that one causes the other. That is for you to test.', 'Δύο πράγματα που αλλάζουν μαζί δεν αποδεικνύουν ότι το ένα προκαλεί το άλλο. Αυτό το ελέγχεις εσύ.'],
['Presenting to a municipality or a mayor is a plan. Whether and when it happens is for each school to arrange.', 'Η παρουσίαση σε δήμο ή δήμαρχο είναι σχέδιο. Το αν και πότε θα γίνει το κανονίζει κάθε σχολείο.'],
            ['The schools and the cities are not ranked. They work on one shared picture of the island.', 'Τα σχολεία και οι πόλεις δεν κατατάσσονται. Δουλεύουν πάνω σε μια κοινή εικόνα του νησιού.'],
    ],
  };
})();
