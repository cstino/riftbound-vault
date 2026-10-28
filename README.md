# Rift Vault

App per gestire la collezione di **Riftbound** (il gioco di carte di League of Legends), costruire mazzi legali e imparare le regole.

- **Collezione**: tutte le 1.408 carte ufficiali, con ricerca e filtri per set, dominio, tipo e rarità; si segnano le copie possedute.
- **Dettaglio carta**: carta olografica interattiva; sotto il testo, la spiegazione di ogni parola chiave con un esempio pratico e il testo della regola ufficiale.
- **Mazzi**: deck builder che applica le regole di costruzione (Core Rules, sezione 103), segnala cosa manca e suggerisce carte spiegando il perché.
- **Impara**: guida per chi inizia e glossario, con riferimento alla regola da cui viene ogni spiegazione.

## Avvio

```bash
npm install
npm run dev
```

## Dati

| File | Contenuto | Fonte |
|---|---|---|
| `public/data/cards.json` | Tutte le carte | Galleria ufficiale (`scripts/update_cards.py`) |
| `public/images/` | Immagini delle carte (WebP 500 px) | Galleria ufficiale |
| `public/data/rules.json` | Core Rules suddivise per numero | `rules/core-rules-*.txt` (`scripts/extract_rules.py`) |
| `public/data/collection.json` | Collezione iniziale | File Excel di partenza |
| `public/data/decks.json` | 6 mazzi precostruiti | File Excel, verificati sulle liste ufficiali |

La galleria ufficiale contiene errori su **Radiance**: tipi e domini sbagliati o vuoti su decine di carte. `scripts/update_cards.py` li corregge (tipo dal testo ufficiale di accessibilità, dominio dalla numerazione per blocchi) e il test `src/test/content.test.ts` lo verifica: i 6 mazzi precostruiti devono risultare legali.

Collezione e mazzi modificati nell’app restano nel browser (IndexedDB).

## Test

```bash
npx vitest run
```
