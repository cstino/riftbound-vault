# Rift Vault: note per chi ci lavora

## Regola principale: niente invenzioni sulle regole
- Ogni spiegazione di gioco (glossario `src/data/glossary.ts`, guida `src/data/learn.ts`, messaggi del validatore `src/lib/deck.ts`) deve derivare dal Core Rules in `rules/` e citare il numero di regola.
- Il quiz (`src/data/quiz.ts`) segue la stessa regola: ogni domanda cita le regole da cui deriva e la spiegazione le riassume; `src/test/quiz.test.ts` controlla regole citate, opzioni e risposte.
- L’allenamento sui combattimenti nel Playground (`src/lib/combat.ts`, `src/data/training.ts`) usa un motore che copre solo combattimento e punteggio, con le regole citate nel codice. Si usano solo unità il cui testo contiene parole chiave gestite dal motore (`TRAINING_POOL`, verificato da `src/test/training.test.ts`). Prima di aggiungere una parola chiave o una carta, implementarla e testarla con gli esempi del Core Rules (`src/test/combat.test.ts`).
- La partita contro il PC (`src/lib/game/`) è un motore completo per il Duel (487): turni, rune, catena e priorità, showdown, movimento, combattimento, cleanup e punteggio, con le regole citate nel codice e nel registro della partita. Un mazzo è giocabile solo se tutte le sue carte sono nel registro (`src/lib/game/cards.ts`); ogni carta registrata deve avere un test in `src/test/game-cards.test.ts` (lo controlla il test di copertura). `src/test/game-sim.test.ts` gioca partite complete PC contro PC e verifica che non nascano stati illegali.
- Il PC (`src/lib/game/ai.ts`) sceglie solo tra le azioni che il motore dichiara legali: la strategia è un'euristica e può giocare male, ma non può barare.
- Gli esempi usano carte reali di `public/data/cards.json`; il test controlla che contengano la parola chiave spiegata.
- I suggerimenti del deck builder (carte da aggiungere, copie, carte da togliere) vengono dai tornei (`public/data/meta.json`): quota delle liste ben piazzate della stessa Legend e copie tipiche (media arrotondata). Mostrano sempre il dato e non si presentano come regole.
- L'overall dei deck (`deckOverall` in `src/lib/deck.ts`) è la stima delle vittorie attese in proporzione al mazzo migliore dei tornei recenti (= 100), dal modello di `scripts/update_meta.py` (tasso della Legend più effetto delle carte, solo ultimi 90 giorni). Mostra sempre vittorie attese e margine. Va riverificato quando si cambia il modello: allenarlo su un periodo e controllare che preveda i tornei successivi meglio di "50% per tutti"; se non ci riesce, non va pubblicato.
- Gli switch del deck builder vengono solo dai tornei (`public/data/meta.json`): carte possedute presenti in almeno metà delle liste ben piazzate della stessa Legend al posto di carte presenti al massimo in una su cinque. Sotto le 10 liste ben piazzate si mostrano lo stesso (scelta dell'utente) ma con l'avviso che i dati sono pochi. Niente switch basati sui temi: non dicono se il mazzo migliora.
- Quando esce un nuovo Core Rules: aggiornare `rules/`, rilanciare `scripts/extract_rules.py`, ricontrollare le voci del glossario toccate e `npx vitest run`.

## Flusso di lavoro
- Le modifiche si fanno sul ramo `prova`: Vercel crea un link di anteprima e l’utente le prova dal telefono.
- Si portano su `main` (il sito principale) solo quando l’utente le approva.

## Dati
- `scripts/update_cards.py` rigenera carte e immagini dalla galleria ufficiale (richiede accesso a playriftbound.com e cmsassets.rgpub.io). Unisce più download perché la galleria a volte omette carte.
- Le immagini delle carte si caricano dal CDN di Riot (`cardImage`): non rimetterle in `public/`, ogni deploy su Vercel le ricopierebbe (~66 MB). `images/` è solo un archivio.
- `scripts/import_precons.py` estrae le liste ufficiali dei mazzi in vendita in `public/data/products.json`. Solo prodotti con lista pubblicata da Riot (non ci sono quelle dei mazzi di Origins). I refusi delle pagine sono in `TYPOS`; i nomi non verificabili vanno in `UNCERTAIN` e l'app chiede conferma all'utente.
- `scripts/update_meta.py` aggiorna `public/data/meta.json` dall'API di TopDeck.gg (serve `TOPDECK_API_KEY`, mai nel repository). Salva solo statistiche aggregate per Legend, niente nomi di giocatori; l'app deve mostrare "Data provided by TopDeck.gg" (condizioni d'uso). Niente scraping di altri siti.
- I dati di Radiance nella galleria hanno tipi e domini sbagliati: vedi `fix_radiance_domains` e la correzione del tipo in `build()`.

## Account
- Login con Supabase (`src/lib/supabase.ts`, `src/lib/auth.tsx`): nessuna pagina si apre senza account e non esiste registrazione; gli utenti li crea l'amministratore dal pannello Supabase (Authentication → Users), con le registrazioni disattivate.
- Collezione e mazzi di ogni utente stanno nella tabella `vault` (`supabase/schema.sql`, protetta da Row Level Security); il browser ne tiene una copia per account in IndexedDB (`src/lib/sync.ts`). La versione online vince al caricamento; poi ogni modifica viene salvata online.
- URL e chiave publishable del progetto sono in `src/lib/supabase.ts` (sono pubblici per natura); le variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` li sovrascrivono (vedi `.env.example`). Mai la chiave `service_role` o `sb_secret_` nell'app o nel repository.

## UI
- Testi dell’interfaccia in italiano; i termini di gioco restano in inglese come sono stampati sulle carte.
- Stile: viola profondo + magenta neon, colori ufficiali dei domini in `src/styles/global.css`. Font: Chakra Petch (titoli), Manrope (testo).
- Motion con `motion/react`; rispettare `prefers-reduced-motion` (già attivo tramite `MotionConfig reducedMotion="user"`).
- Skill di progetto in `.claude/skills/`: frontend-design, motion-design, motion-dev-animations, webapp-testing.
