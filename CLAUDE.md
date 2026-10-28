# Rift Vault: note per chi ci lavora

## Regola principale: niente invenzioni sulle regole
- Ogni spiegazione di gioco (glossario `src/data/glossary.ts`, guida `src/data/learn.ts`, messaggi del validatore `src/lib/deck.ts`) deve derivare dal Core Rules in `rules/` e citare il numero di regola.
- Il quiz (`src/data/quiz.ts`) segue la stessa regola: ogni domanda cita le regole da cui deriva e la spiegazione le riassume; `src/test/quiz.test.ts` controlla regole citate, opzioni e risposte.
- L'allenamento (`src/lib/combat.ts`, `src/data/training.ts`) usa un motore che copre solo combattimento e punteggio, con le regole citate nel codice. Si usano solo unità il cui testo contiene parole chiave gestite dal motore (`TRAINING_POOL`, verificato da `src/test/training.test.ts`). Prima di aggiungere una parola chiave o una carta, implementarla e testarla con gli esempi del Core Rules (`src/test/combat.test.ts`).
- Gli esempi usano carte reali di `public/data/cards.json`; il test controlla che contengano la parola chiave spiegata.
- I suggerimenti del deck builder sono euristiche: devono sempre mostrare il motivo e non presentarsi come regole.
- Quando esce un nuovo Core Rules: aggiornare `rules/`, rilanciare `scripts/extract_rules.py`, ricontrollare le voci del glossario toccate e `npx vitest run`.

## Flusso di lavoro
- Le modifiche si fanno sul ramo `prova`: Vercel crea un link di anteprima e l’utente le prova dal telefono.
- Si portano su `main` (il sito principale) solo quando l’utente le approva.

## Dati
- `scripts/update_cards.py` rigenera carte e immagini dalla galleria ufficiale (richiede accesso a playriftbound.com e cmsassets.rgpub.io). Unisce più download perché la galleria a volte omette carte.
- Le immagini delle carte si caricano dal CDN di Riot (`cardImage`): non rimetterle in `public/`, ogni deploy su Vercel le ricopierebbe (~66 MB). `images/` è solo un archivio.
- `scripts/import_precons.py` estrae le liste ufficiali dei mazzi in vendita in `public/data/products.json`. Solo prodotti con lista pubblicata da Riot (non ci sono quelle dei mazzi di Origins). I refusi delle pagine sono in `TYPOS`; i nomi non verificabili vanno in `UNCERTAIN` e l'app chiede conferma all'utente.
- I dati di Radiance nella galleria hanno tipi e domini sbagliati: vedi `fix_radiance_domains` e la correzione del tipo in `build()`.

## UI
- Testi dell’interfaccia in italiano; i termini di gioco restano in inglese come sono stampati sulle carte.
- Stile: viola profondo + magenta neon, colori ufficiali dei domini in `src/styles/global.css`. Font: Chakra Petch (titoli), Manrope (testo).
- Motion con `motion/react`; rispettare `prefers-reduced-motion` (già attivo tramite `MotionConfig reducedMotion="user"`).
- Skill di progetto in `.claude/skills/`: frontend-design, motion-design, motion-dev-animations, webapp-testing.
