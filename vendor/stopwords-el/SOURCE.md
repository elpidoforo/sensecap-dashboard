# stopwords-el (Greek stop words)

- Source: https://github.com/stopwords-iso/stopwords-el
- Commit: d9e49e4c835570d4425db832832b7e834013ecf5 (2020-03-06)
- Licence: MIT (see LICENSE in this folder; copyright 2016 Gene Diaz)
- File: `stopwords-el.txt`, copied byte for byte, one word per line (846 lines).
- Used by: `greek.js` (the search for the AI guide). Nothing else reads it.

Known quirks of the upstream file (kept as they are, `greek.js` repairs them when it loads the list):
- About 70 entries have the symbol U+2206 (INCREMENT) where the letter delta should be (for example `ι∆ια`, `∆εν`). `greek.js` turns it back into delta.
- A few entries are not words (`γα^`, `ταυτο,ταυτον`, entries with an apostrophe). `greek.js` splits the comma one and drops the others.
- Old (polytonic) Greek words are mixed in. They do no harm.
- A few words that matter for sensor questions are in the list (`μέσα`, `έξω`, `χαμηλά`, `ψηλά`, `όχι`, `σήμερα`, `αύριο`, `κοντά`, `κάτω`, `άνω`). `greek.js` keeps those out of the stop list (see KEEP there).
