/*
  Lesson packs: seven 45-minute investigations for ages 12 to 15, written for this platform (original text, nothing copied).
  Each one is tied to a tool that exists here: the question, what you need, the steps, what to look for, a discussion question,
  and how the result could be wrong. A link to a tool is shown only when that page exists on this site (SC.ready).
  No data is read and no text is typed on this page. #/lessons/<id> opens one lesson; each lesson prints on its own page.
*/
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const kit = () => (window.TK4 ? Promise.resolve(window.TK4) : (window.__tk4p = window.__tk4p || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk4-kit.js?v=1';
    s.onload = () => res(window.TK4); s.onerror = () => { window.__tk4p = null; s.remove(); rej(new Error('kit')); }; document.head.append(s);
  })));

  // Every text is [English, Greek]. tool: the page the lesson uses; rest: what follows #/<tool>.
  const LESSONS = [
    { id: 'agree', tool: 'layers', rest: '',
      title: ['Do the sources agree?', 'Συμφωνούν οι πηγές;'],
      q: ['An official station, a computer model and a low-cost sensor all give a temperature for our city. Do they say the same thing right now?', 'Ένας επίσημος σταθμός, ένα μοντέλο υπολογιστή και ένας αισθητήρας χαμηλού κόστους δίνουν όλοι μια θερμοκρασία για την πόλη μας. Λένε το ίδιο αυτή τη στιγμή;'],
      need: [['A screen with Data layers open on the Compare view', 'Μια οθόνη με τα Στρώματα δεδομένων ανοιχτά στη Σύγκριση'], ['A sheet of paper with a table: source, kind, number, time', 'Ένα φύλλο χαρτί με πίνακα: πηγή, είδος, αριθμός, ώρα']],
      steps: [
        ['Choose your city and the measurement “Air temperature”.', 'Διάλεξε την πόλη σου και τη μέτρηση «Θερμοκρασία αέρα».'],
        ['Copy every source into your table: its name, what kind it is, its number with the unit, and the time.', 'Αντίγραψε κάθε πηγή στον πίνακά σου: το όνομά της, τι είδος είναι, τον αριθμό με τη μονάδα, και την ώρα.'],
        ['Find the lowest and the highest number. Subtract. This is the spread.', 'Βρες τον μικρότερο και τον μεγαλύτερο αριθμό. Κάνε αφαίρεση. Αυτό είναι το εύρος.'],
        ['Mark which sources are outdoors and which are inside a vehicle. Work out the spread again using only the outdoor ones.', 'Σημείωσε ποιες πηγές είναι έξω και ποιες μέσα σε όχημα. Υπολόγισε ξανά το εύρος μόνο με όσες είναι έξω.'],
        ['Repeat for a second measurement, for example humidity.', 'Επανάλαβε για μια δεύτερη μέτρηση, για παράδειγμα την υγρασία.'],
      ],
      look: [['Which two sources are closest? Are they the same kind?', 'Ποιες δύο πηγές είναι πιο κοντά; Είναι του ίδιου είδους;'], ['Does the spread get smaller when you leave out the readings from inside vehicles?', 'Μικραίνει το εύρος όταν αφήσεις έξω τις μετρήσεις από το εσωτερικό οχημάτων;']],
      talk: ['If three sources give three numbers, which one is “the” temperature of the city? Is there such a thing?', 'Αν τρεις πηγές δίνουν τρεις αριθμούς, ποιος είναι «η» θερμοκρασία της πόλης; Υπάρχει κάτι τέτοιο;'],
      wrong: ['The sources are not in the same spot and do not report at the same minute. A model is a calculation, not a thermometer. One moment is a tiny sample: at another hour the picture can be different.', 'Οι πηγές δεν βρίσκονται στο ίδιο σημείο και δεν στέλνουν το ίδιο λεπτό. Το μοντέλο είναι υπολογισμός, όχι θερμόμετρο. Μία στιγμή είναι πολύ μικρό δείγμα: άλλη ώρα η εικόνα μπορεί να είναι διαφορετική.'] },
    { id: 'claim', tool: 'claims', rest: '',
      title: ['Supported, not supported, or cannot tell', 'Στηρίζεται, δεν στηρίζεται, ή δεν μπορούμε να πούμε'],
      q: ['Can we write a statement that sounds obvious, and then find that the data cannot tell?', 'Μπορούμε να γράψουμε μια πρόταση που ακούγεται αυτονόητη και μετά να δούμε ότι τα δεδομένα δεν μπορούν να πουν;'],
      need: [['Claim check open on a screen, in pairs', 'Τον Έλεγχο ισχυρισμού ανοιχτό σε οθόνη, σε ζευγάρια'], ['Three slips of paper per pair', 'Τρία χαρτάκια για κάθε ζευγάρι']],
      steps: [
        ['Before you touch the screen, write three statements you believe about the cities, one per slip. Example: “It is windier in Larnaka than in Lefkosia.”', 'Πριν αγγίξεις την οθόνη, γράψε τρεις προτάσεις που πιστεύεις για τις πόλεις, μία σε κάθε χαρτάκι. Παράδειγμα: «Στη Λάρνακα φυσά περισσότερο από τη Λευκωσία.»'],
        ['Build the first statement from the blocks and press Check.', 'Φτιάξε την πρώτη πρόταση με τα κομμάτια και πάτα Έλεγχος.'],
        ['On the slip, write the answer and the two numbers that decided it, with their times and layers.', 'Στο χαρτάκι γράψε την απάντηση και τους δύο αριθμούς που την έκριναν, με τις ώρες και τα στρώματά τους.'],
        ['Do the same for the other two. Then change “now” to “over the saved day” for one of them and see if the answer changes.', 'Κάνε το ίδιο για τις άλλες δύο. Μετά άλλαξε το «τώρα» σε «όλη την αποθηκευμένη μέρα» για μία από αυτές και δες αν αλλάζει η απάντηση.'],
        ['Sort all the class slips into three piles: supported, not supported, cannot tell.', 'Χωρίστε όλα τα χαρτάκια της τάξης σε τρεις στοίβες: στηρίζεται, δεν στηρίζεται, δεν μπορούμε να πούμε.'],
      ],
      look: [['Which pile is the biggest? Why might “cannot tell” be so common?', 'Ποια στοίβα είναι η μεγαλύτερη; Γιατί μπορεί το «δεν μπορούμε να πούμε» να είναι τόσο συχνό;'], ['Did any statement get different answers from different kinds of source?', 'Πήρε κάποια πρόταση διαφορετικές απαντήσεις από διαφορετικά είδη πηγών;']],
      talk: ['Is “the data cannot tell” a failure, or a result? When would you rather hear it than a confident “yes”?', 'Το «τα δεδομένα δεν μπορούν να πουν» είναι αποτυχία ή αποτέλεσμα; Πότε θα προτιμούσες να το ακούσεις αντί για ένα σίγουρο «ναι»;'],
      wrong: ['The check looks at one moment or one short saved day. A statement can be supported today and not next week. “Supported” means the numbers agree with it now; it never explains why.', 'Ο έλεγχος κοιτά μία στιγμή ή μία σύντομη αποθηκευμένη μέρα. Μια πρόταση μπορεί να στηρίζεται σήμερα και όχι την άλλη εβδομάδα. «Στηρίζεται» σημαίνει ότι οι αριθμοί συμφωνούν μαζί της τώρα· δεν εξηγεί ποτέ το γιατί.'] },
    { id: 'eyes', tool: 'notebook', rest: '',
      title: ['Eyes against sensors', 'Μάτια απέναντι σε αισθητήρες'],
      q: ['When the sky looks hazy or dusty to us, do the dust numbers for our city agree?', 'Όταν ο ουρανός μάς φαίνεται θολός ή με σκόνη, συμφωνούν οι αριθμοί της σκόνης για την πόλη μας;'],
      need: [['A window or the schoolyard, and one device with the Field notebook', 'Ένα παράθυρο ή την αυλή, και μία συσκευή με το Τετράδιο πεδίου'], ['Three observation moments: start, middle and end of the lesson', 'Τρεις στιγμές παρατήρησης: αρχή, μέση και τέλος του μαθήματος']],
      steps: [
        ['Look at the sky and the far horizon for one quiet minute. Decide together: clear, hazy, dusty or cloudy.', 'Κοίταξε τον ουρανό και τον μακρινό ορίζοντα για ένα ήσυχο λεπτό. Αποφασίστε μαζί: καθαρός, θολός, με σκόνη ή συννεφιασμένος.'],
        ['Feel the wind and note the windows. Save the entry. Do not write names or where exactly you stand.', 'Νιώσε τον άνεμο και σημείωσε τα παράθυρα. Αποθήκευσε την καταγραφή. Μη γράφεις ονόματα ή πού ακριβώς στέκεσαι.'],
        ['Read the numbers that appear beside your entry. Underline dust, PM10 and wind speed.', 'Διάβασε τους αριθμούς που εμφανίζονται δίπλα στην καταγραφή σου. Υπογράμμισε τη σκόνη, τα PM10 και την ταχύτητα ανέμου.'],
        ['Repeat twice more during the lesson.', 'Επανάλαβε άλλες δύο φορές μέσα στο μάθημα.'],
        ['Make a small table: what we saw, what the dust number was. Print the notebook for your folder.', 'Φτιάξε έναν μικρό πίνακα: τι είδαμε, ποιος ήταν ο αριθμός της σκόνης. Εκτύπωσε το τετράδιο για τον φάκελό σου.'],
      ],
      look: [['Did “dusty” go with a higher dust number than “clear”?', 'Πήγαινε το «με σκόνη» μαζί με μεγαλύτερο αριθμό σκόνης από ό,τι το «καθαρός»;'], ['Did “strong wind” go with a higher wind speed? How far off were you?', 'Πήγαινε το «δυνατός άνεμος» μαζί με μεγαλύτερη ταχύτητα ανέμου; Πόσο έξω έπεσες;']],
      talk: ['The dust number comes from a model for the whole city. Your eyes see one street. Which would you trust for deciding whether to play sport outside, and why?', 'Ο αριθμός της σκόνης προέρχεται από μοντέλο για όλη την πόλη. Τα μάτια σου βλέπουν έναν δρόμο. Ποιο θα εμπιστευόσουν για να αποφασίσεις αν θα κάνεις άθλημα έξω, και γιατί;'],
      wrong: ['Three entries are far too few to see a pattern. People judge “hazy” differently. Humidity and sea mist also make the horizon blurry, so haze is not always dust.', 'Τρεις καταγραφές είναι πολύ λίγες για να φανεί μοτίβο. Οι άνθρωποι κρίνουν το «θολός» διαφορετικά. Η υγρασία και η θαλασσινή ομίχλη θολώνουν επίσης τον ορίζοντα, άρα η θολούρα δεν είναι πάντα σκόνη.'] },
    { id: 'plan', tool: 'experiment', rest: '',
      title: ['Plan before you measure', 'Σχεδίασε πριν μετρήσεις'],
      q: ['What turns a wish (“I want to know about the air”) into a question that numbers can answer?', 'Τι κάνει μια ευχή («θέλω να μάθω για τον αέρα») ερώτηση που μπορούν να απαντήσουν οι αριθμοί;'],
      need: [['The Experiment builder, in teams of three', 'Το «Σχεδίασε ένα πείραμα», σε ομάδες των τριών'], ['A printer, or paper to copy the plan by hand', 'Έναν εκτυπωτή, ή χαρτί για να αντιγράψεις το σχέδιο με το χέρι']],
      steps: [
        ['Read the list of questions. As a team, choose one, or write your own in one short line.', 'Διάβασε τη λίστα με τις ερωτήσεις. Ως ομάδα, διαλέξτε μία ή γράψτε τη δική σας σε μια σύντομη γραμμή.'],
        ['Each person writes a secret guess on paper. Then compare, agree on one, and enter it in step 2.', 'Καθένας γράφει κρυφά μια πρόβλεψη σε χαρτί. Μετά συγκρίνετε, συμφωνήστε σε μία και βάλτε τη στο βήμα 2.'],
        ['Choose the measurement, the city, how long, and how you will compare.', 'Διαλέξτε τη μέτρηση, την πόλη, για πόσο, και πώς θα συγκρίνετε.'],
        ['Read the line “How the result could be wrong”. Add one more danger of your own on the printed plan.', 'Διαβάστε τη γραμμή «Πώς θα μπορούσε να είναι λάθος το αποτέλεσμα». Προσθέστε έναν ακόμη δικό σας κίνδυνο στο εκτυπωμένο σχέδιο.'],
        ['Swap plans with another team. Each team asks the other one hard question.', 'Ανταλλάξτε σχέδια με άλλη ομάδα. Κάθε ομάδα κάνει στην άλλη μία δύσκολη ερώτηση.'],
      ],
      look: [['Does the plan say what result would prove your guess wrong?', 'Λέει το σχέδιο ποιο αποτέλεσμα θα έδειχνε ότι η πρόβλεψή σας ήταν λάθος;'], ['Does it change only one thing at a time?', 'Αλλάζει μόνο ένα πράγμα κάθε φορά;']],
      talk: ['Why is a guess written before measuring worth more than a guess written after?', 'Γιατί μια πρόβλεψη γραμμένη πριν τη μέτρηση αξίζει περισσότερο από μια πρόβλεψη γραμμένη μετά;'],
      wrong: ['A plan is not a result. A neat plan can still measure the wrong thing, for too short a time, or compare readings that are not of the same kind.', 'Το σχέδιο δεν είναι αποτέλεσμα. Ένα προσεγμένο σχέδιο μπορεί και πάλι να μετρά λάθος πράγμα, για πολύ λίγο χρόνο, ή να συγκρίνει μετρήσεις που δεν είναι του ίδιου είδους.'] },
    { id: 'record', tool: 'weather', rest: '',
      title: ['The shape of a day', 'Το σχήμα μιας μέρας'],
      q: ['At what hour was it warmest in the last 24 hours, and is it the same hour at every official station?', 'Ποια ώρα ήταν η πιο ζεστή στις τελευταίες 24 ώρες, και είναι η ίδια ώρα σε κάθε επίσημο σταθμό;'],
      need: [['The Met Office record page with the station history', 'Τη σελίδα «Μετεωρολογικό αρχείο» με το ιστορικό των σταθμών'], ['Squared paper and a pencil', 'Χαρτί με τετραγωνάκια και ένα μολύβι']],
      steps: [
        ['Pick two stations: one near the sea and one inland or higher up.', 'Διάλεξε δύο σταθμούς: έναν κοντά στη θάλασσα και έναν στην ενδοχώρα ή πιο ψηλά.'],
        ['For each, write the temperature every three hours over the last day, with the time.', 'Για τον καθένα, γράψε τη θερμοκρασία κάθε τρεις ώρες στην τελευταία μέρα, με την ώρα.'],
        ['Draw both lines on the same squared paper, with the same scale starting from a sensible number.', 'Σχεδίασε και τις δύο γραμμές στο ίδιο χαρτί, με την ίδια κλίμακα που ξεκινά από έναν λογικό αριθμό.'],
        ['Mark the highest and the lowest point of each line. Work out the range of each station.', 'Σημείωσε το ψηλότερο και το χαμηλότερο σημείο κάθε γραμμής. Υπολόγισε το εύρος κάθε σταθμού.'],
      ],
      look: [['Which station has the bigger swing between day and night?', 'Ποιος σταθμός έχει τη μεγαλύτερη διαφορά ανάμεσα σε μέρα και νύχτα;'], ['Do the two lines peak at the same hour?', 'Κορυφώνονται οι δύο γραμμές την ίδια ώρα;']],
      talk: ['You found a difference between two places. List three things about the places that are different. Can your data say which of them matters?', 'Βρήκες διαφορά ανάμεσα σε δύο τόπους. Γράψε τρία πράγματα στα οποία διαφέρουν οι τόποι. Μπορούν τα δεδομένα σου να πουν ποιο από αυτά μετράει;'],
      wrong: ['Reading every three hours can miss the real peak. One day may be unusual (cloud, a hot wind). A station can have gaps: a missing hour is missing, not zero.', 'Διαβάζοντας κάθε τρεις ώρες μπορεί να χάσεις την πραγματική κορυφή. Μία μέρα μπορεί να είναι ασυνήθιστη (σύννεφα, ζεστός άνεμος). Ένας σταθμός μπορεί να έχει κενά: μια ώρα που λείπει είναι κενό, όχι μηδέν.'] },
    { id: 'cities', tool: 'districts', rest: '',
      title: ['Four cities, one island', 'Τέσσερις πόλεις, ένα νησί'],
      q: ['Do the four districts really differ, or is the difference smaller than the disagreement between sensors?', 'Διαφέρουν πραγματικά οι τέσσερις επαρχίες, ή η διαφορά είναι μικρότερη από τη διαφωνία ανάμεσα στους αισθητήρες;'],
      need: [['The Districts and neighbourhoods page', 'Τη σελίδα «Επαρχίες και γειτονιές»'], ['A table with one row per district', 'Έναν πίνακα με μία γραμμή για κάθε επαρχία']],
      steps: [
        ['Choose one measurement. Write each district’s number, how many sensors or stations stand behind it, and the time.', 'Διάλεξε μία μέτρηση. Γράψε τον αριθμό κάθε επαρχίας, πόσοι αισθητήρες ή σταθμοί βρίσκονται πίσω του, και την ώρα.'],
        ['Order the districts by the number. This is an order by a number, nothing more.', 'Βάλε τις επαρχίες σε σειρά με βάση τον αριθμό. Είναι μια σειρά με βάση έναν αριθμό, τίποτα παραπάνω.'],
        ['Find the gap between the first and the last.', 'Βρες τη διαφορά ανάμεσα στην πρώτη και την τελευταία.'],
        ['Now look inside one district: how far apart are its own sources? Compare that with the gap between districts.', 'Τώρα κοίτα μέσα σε μία επαρχία: πόσο απέχουν οι δικές της πηγές; Σύγκρινέ το με τη διαφορά ανάμεσα στις επαρχίες.'],
      ],
      look: [['Is the gap between districts bigger than the gap inside one district?', 'Είναι η διαφορά ανάμεσα στις επαρχίες μεγαλύτερη από τη διαφορά μέσα σε μία επαρχία;'], ['Which district’s number rests on the fewest sensors?', 'Ο αριθμός ποιας επαρχίας στηρίζεται στους λιγότερους αισθητήρες;']],
      talk: ['Why would it be unfair to call a district “better” or “worse” from this table?', 'Γιατί θα ήταν άδικο να πούμε μια επαρχία «καλύτερη» ή «χειρότερη» με βάση αυτόν τον πίνακα;'],
      wrong: ['A district with one sensor is described by that one sensor’s spot. Vehicles move, so their readings mix many places and are shown late and rounded. Indoor readings must not be set against outdoor ones.', 'Μια επαρχία με έναν αισθητήρα περιγράφεται από το σημείο εκείνου του ενός αισθητήρα. Τα οχήματα κινούνται, άρα οι μετρήσεις τους ανακατεύουν πολλά μέρη και εμφανίζονται με καθυστέρηση και στρογγυλοποίηση. Οι μετρήσεις εσωτερικού χώρου δεν μπαίνουν απέναντι σε μετρήσεις έξω.'] },
    { id: 'chart', tool: 'explore', rest: '',
      title: ['The same numbers, two stories', 'Οι ίδιοι αριθμοί, δύο ιστορίες'],
      q: ['Can one set of readings be drawn so that it looks calm, and again so that it looks dramatic?', 'Μπορεί η ίδια σειρά μετρήσεων να σχεδιαστεί έτσι ώστε να δείχνει ήρεμη, και ξανά έτσι ώστε να δείχνει δραματική;'],
      need: [['Explore data, to read one day of one measurement', 'Την «Εξερεύνηση», για να διαβάσεις μία μέρα μίας μέτρησης'], ['Two sheets of squared paper per pair', 'Δύο φύλλα χαρτί με τετραγωνάκια για κάθε ζευγάρι']],
      steps: [
        ['Choose one sensor or station and one measurement. Write down eight readings across a day, with their times and the unit.', 'Διάλεξε έναν αισθητήρα ή σταθμό και μία μέτρηση. Γράψε οκτώ μετρήσεις μέσα σε μια μέρα, με τις ώρες και τη μονάδα.'],
        ['Chart A: draw them with the upright axis starting at zero.', 'Διάγραμμα Α: σχεδίασέ τες με τον κάθετο άξονα να ξεκινά από το μηδέν.'],
        ['Chart B: draw the same numbers with the axis starting just under the lowest reading.', 'Διάγραμμα Β: σχεδίασε τους ίδιους αριθμούς με τον άξονα να ξεκινά λίγο κάτω από τη μικρότερη μέτρηση.'],
        ['Give each chart a headline a newspaper might use. Swap with another pair and guess which chart got which headline.', 'Δώσε σε κάθε διάγραμμα έναν τίτλο που θα έβαζε μια εφημερίδα. Αντάλλαξε με άλλο ζευγάρι και μάντεψε ποιο διάγραμμα πήρε ποιον τίτλο.'],
        ['Write the honest headline: the lowest, the highest, the unit and the time span.', 'Γράψε τον ειλικρινή τίτλο: το χαμηλότερο, το ψηλότερο, τη μονάδα και το χρονικό διάστημα.'],
      ],
      look: [['Which chart makes the change look bigger? Did any number change?', 'Ποιο διάγραμμα κάνει την αλλαγή να φαίνεται μεγαλύτερη; Άλλαξε κάποιος αριθμός;'], ['Does each chart show its unit, its time span and where the axis starts?', 'Δείχνει κάθε διάγραμμα τη μονάδα του, το χρονικό διάστημα και από πού ξεκινά ο άξονας;']],
      talk: ['Is chart B a lie? When is a zoomed-in axis the right choice, and what must you tell the reader?', 'Είναι το διάγραμμα Β ψέμα; Πότε είναι σωστή επιλογή ένας άξονας με ζουμ, και τι πρέπει να πεις στον αναγνώστη;'],
      wrong: ['Eight readings cannot show what happened between them. A hand-drawn line joins points as if the change were smooth, which you did not measure.', 'Οκτώ μετρήσεις δεν δείχνουν τι έγινε ανάμεσά τους. Μια γραμμή με το χέρι ενώνει τα σημεία σαν η αλλαγή να ήταν ομαλή, κάτι που δεν μέτρησες.'] },
  ];
  const T2 = (p) => t(p[0], p[1]);

  SC.register('lessons', {
    title: ['Lesson packs', 'Πακέτα μαθημάτων'],
    render(root, ctx) {
      SC.css('/site/pages/tk4.css');
      root.append(SC.head({
        title: t('Lesson packs', 'Πακέτα μαθημάτων'),
        lede: t('Seven investigations of 45 minutes each, for ages 12 to 15. Every one uses a tool of this platform and ends by asking how the result could be wrong.',
          'Επτά έρευνες των 45 λεπτών, για ηλικίες 12 έως 15. Καθεμία χρησιμοποιεί ένα εργαλείο της πλατφόρμας και τελειώνει ρωτώντας πώς θα μπορούσε το αποτέλεσμα να είναι λάθος.'),
        help: ['Each lesson has a question, what you need, numbered steps, what to look for, a discussion question, and a box on how the result could be wrong. Press “Open the tool” to go to the page the lesson uses. Press “Print this lesson” for one sheet, or “Print all” for the whole pack. The lessons were written for this platform. They give no answers, because the answers depend on the day’s data.',
          'Κάθε μάθημα έχει μια ερώτηση, τι χρειάζεσαι, αριθμημένα βήματα, τι να προσέξεις, μια ερώτηση για συζήτηση και ένα πλαίσιο για το πώς θα μπορούσε το αποτέλεσμα να είναι λάθος. Πάτα «Άνοιξε το εργαλείο» για να πας στη σελίδα που χρησιμοποιεί το μάθημα. Πάτα «Εκτύπωσε αυτό το μάθημα» για ένα φύλλο ή «Εκτύπωσέ τα όλα» για όλο το πακέτο. Τα μαθήματα γράφτηκαν για αυτή την πλατφόρμα. Δεν δίνουν απαντήσεις, γιατί οι απαντήσεις εξαρτώνται από τα δεδομένα της μέρας.'],
        tags: [{ text: t('45 minutes each', '45 λεπτά το καθένα'), cls: 'daily' }, { text: t('Ages 12 to 15', 'Ηλικίες 12 έως 15'), cls: 'team' }],
      }));
      const host = el('div', { class: 'k4 k4-lessons' }, el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      root.append(host);
      let alive = true;
      const after = () => { document.body.classList.remove('k4-one'); host.querySelectorAll('.k4-pick').forEach((n) => n.classList.remove('k4-pick')); };
      window.addEventListener('afterprint', after);
      kit().then((K) => {
        if (!alive) return;
        const list = (items, ordered) => el(ordered ? 'ol' : 'ul', null, items.map((x) => el('li', null, T2(x))));
        const lesson = (L, i) => {
          const card = el('article', { class: 'k4-panel k4-lesson', id: 'k4-l-' + L.id, tabindex: '-1' });
          const go = K.toolLink(L.tool, L.rest, t('Open the tool: ', 'Άνοιξε το εργαλείο: ') + K.toolName(L.tool));
          card.append(
            el('header', null, el('span', { class: 'k4-n' }, t('Lesson ', 'Μάθημα ') + (i + 1)), el('h2', null, T2(L.title))),
            el('div', { class: 'k4-meta' }, el('span', null, t('45 minutes', '45 λεπτά')), el('span', null, t('Ages 12 to 15', 'Ηλικίες 12 έως 15')), el('span', null, t('Tool: ', 'Εργαλείο: ') + K.toolName(L.tool))),
            el('p', { class: 'k4-qn' }, T2(L.q)),
            el('div', { class: 'k4-lgrid' },
              el('div', null, el('div', null, el('h4', null, t('Steps', 'Βήματα')), list(L.steps, true))),
              el('div', null,
                el('div', null, el('h4', null, t('What you need', 'Τι χρειάζεσαι')), list(L.need)),
                el('div', null, el('h4', null, t('What to look for', 'Τι να προσέξεις')), list(L.look)),
                el('div', null, el('h4', null, t('Talk about it', 'Για συζήτηση')), el('p', null, T2(L.talk))))),
            el('div', { class: 'k4-wrong' }, el('h4', null, t('How the result could be wrong', 'Πώς θα μπορούσε να είναι λάθος το αποτέλεσμα')), el('p', null, T2(L.wrong))),
            el('div', { class: 'k4-links k4-noprint' }, go || el('span', { class: 'k4-fine' }, t('The tool for this lesson is not on this site yet.', 'Το εργαλείο αυτού του μαθήματος δεν υπάρχει ακόμη σε αυτόν τον ιστότοπο.')),
              el('button', { class: 'nm-btn', type: 'button', onclick: () => { after(); card.classList.add('k4-pick'); document.body.classList.add('k4-one'); window.print(); } }, t('Print this lesson', 'Εκτύπωσε αυτό το μάθημα'))));
          return card;
        };
        const jump = (id, focus) => { const n = host.querySelector('#k4-l-' + id); if (n) { n.scrollIntoView({ block: 'start' }); if (focus) n.focus({ preventScroll: true }); } };
        host.replaceChildren(
          el('div', { class: 'k4-panel' },
            el('div', { class: 'k4-top' }, el('h2', null, t('Choose an investigation', 'Διάλεξε μια έρευνα')), el('span', { class: 'k4-noprint' }, K.printBtn(t('Print all', 'Εκτύπωσέ τα όλα')))),
            el('p', { class: 'k4-fine' }, t('For the teacher: every lesson works with whatever the data shows on the day. If a layer is silent, the page says so, and that is worth discussing too. No lesson asks students to type names or personal details.', 'Για τον εκπαιδευτικό: κάθε μάθημα δουλεύει με ό,τι δείχνουν τα δεδομένα εκείνη τη μέρα. Αν ένα στρώμα σιωπά, η σελίδα το λέει, και αξίζει κι αυτό συζήτηση. Κανένα μάθημα δεν ζητά από τους μαθητές να γράψουν ονόματα ή προσωπικά στοιχεία.')),
            el('nav', { class: 'k4-toc k4-noprint', 'aria-label': t('Lessons', 'Μαθήματα') }, LESSONS.map((L, i) => el('a', { href: '#/lessons/' + L.id, onclick: (e) => { e.preventDefault(); jump(L.id, true); } }, (i + 1) + '. ' + T2(L.title), el('small', null, K.toolName(L.tool)))))),
          ...LESSONS.map(lesson));
        const want = ctx.args && ctx.args[0];
        if (want && LESSONS.some((L) => L.id === want)) setTimeout(() => alive && jump(want, false), 60);
      }).catch(() => { if (alive) host.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('This page could not be loaded. Reload and try again.', 'Η σελίδα δεν φορτώθηκε. Κάνε ανανέωση και δοκίμασε ξανά.'))); });
      document.body.classList.add('k4-on');
      return () => { alive = false; window.removeEventListener('afterprint', after); document.body.classList.remove('k4-on', 'k4-one'); };
    },
  });
})();
