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
| `images/` | Archivio delle immagini (WebP 500 px), **non pubblicato** | Galleria ufficiale |
| `public/data/rules.json` | Core Rules suddivise per numero | `rules/core-rules-*.txt` (`scripts/extract_rules.py`) |
| `public/data/collection.json` | Collezione iniziale | File Excel di partenza |
| `public/data/decks.json` | 6 mazzi precostruiti iniziali | File Excel, identici alle liste ufficiali |
| `public/data/products.json` | Mazzi ufficiali in vendita (8 mazzi, 6 prodotti) | Pagine ufficiali di Riot (`scripts/import_precons.py`) |

La galleria ufficiale contiene errori su **Radiance**: tipi e domini sbagliati o vuoti su decine di carte. `scripts/update_cards.py` li corregge (tipo dal testo ufficiale di accessibilità, dominio dalla numerazione per blocchi) e il test `src/test/content.test.ts` lo verifica: i 6 mazzi precostruiti devono risultare legali.

L’app carica le immagini delle carte dal CDN ufficiale di Riot (`cardImage` in `src/lib/data.ts`), così ogni deploy pesa ~2,5 MB invece di ~70 MB.

Collezione e mazzi modificati nell’app restano nel browser (IndexedDB).

## Test

```bash
npx vitest run
```
