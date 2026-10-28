import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDb } from "../lib/useDb";
import { useVault } from "../lib/store";
import type { Card, Deck } from "../lib/types";
import {
  asset,
  isBasePrinting,
  isBattlefield,
  isChampionUnit,
  isLegend,
  isRune,
  isSignature,
  legendChampionTag,
  sortCards,
  cardImage,
} from "../lib/data";
import {
  BATTLEFIELDS_REQUIRED,
  MAIN_MIN,
  RUNES_REQUIRED,
  countOf,
  deckThemes,
  fitsIdentity,
  isUnique,
  MAX_COPIES,
  presetToDeck,
  replaceOptions,
  metaSwitches,
  META_IN,
  META_OUT,
  type MetaData,
  type MetaSwitch,
  suggestCards,
  validateDeck,
} from "../lib/deck";
import { DomainIcon, EnergyGlyph, MightGlyph } from "../components/Icons";
import { RuleQuote } from "../components/Explainer";
import { askConfirm } from "../components/ConfirmDialog";
import { cardParagraphs } from "../components/CardText";
import { availableCopies, ownedByName, ownedCoverage } from "./deckUtils";
import "./deckBuilder.css";

type Tab = "mazzo" | "modifica" | "regole";

/** Una stampa per nome: la base se esiste. */
function uniqueByName(cards: Card[]) {
  const m = new Map<string, Card>();
  for (const c of [...cards].sort(
    (a, b) =>
      Number(isBasePrinting(b)) - Number(isBasePrinting(a)) || sortCards(a, b),
  )) {
    if (!m.has(c.name)) m.set(c.name, c);
  }
  return [...m.values()].sort(sortCards);
}

export function DeckBuilder() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const deck = useVault((s) => s.decks.find((d) => d.id === id));
  const saveDeck = useVault((s) => s.saveDeck);
  const deleteDeck = useVault((s) => s.deleteDeck);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("mazzo");
  const [replacing, setReplacing] = useState<Card | null>(null);

  if (!deck) {
    return (
      <div className="empty">
        <p>Questo mazzo non esiste più.</p>
        <Link className="btn btn-small" to="/mazzi" style={{ marginTop: 12 }}>
          Torna ai deck
        </Link>
      </div>
    );
  }

  const edit = (fn: (d: Deck) => void) => {
    const next: Deck = structuredClone(deck);
    fn(next);
    saveDeck(next);
  };
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined;
  const champion = deck.championId ? db.byId.get(deck.championId) : undefined;
  /** Aggiunge una copia; con il mazzo principale già a 40 chiede prima cosa togliere. */
  const requestAdd = (c: Card) => {
    if (!isBattlefield(c) && countOf(deck.main) >= MAIN_MIN) setReplacing(c);
    else edit((d) => addCopy(d, c, db));
  };

  return (
    <div className="builder">
      {deck.preset && <OwnedDeckBox deck={deck} />}
      <header className="builder-head">
        <Link to="/mazzi" className="link-more">
          ← Deck
        </Link>
        <input
          className="builder-name"
          value={deck.name}
          onChange={(e) => edit((d) => void (d.name = e.target.value))}
          aria-label="Nome del mazzo"
        />
        {legend && (
          <p className="builder-identity">
            {legend.domains.map((d) => (
              <DomainIcon key={d} domain={d} size={20} />
            ))}
            <span>{legend.name}</span>
            <button
              type="button"
              className="link-more"
              onClick={() =>
                edit((d) =>
                  Object.assign(d, { legendId: null, championId: null }),
                )
              }
            >
              Cambia Legend
            </button>
          </p>
        )}
      </header>

      {!legend ? (
        <LegendPicker
          deckId={deck.id}
          onPick={(c) => edit((d) => setLegend(d, c, db))}
        />
      ) : !champion ? (
        <ChampionPicker
          deckId={deck.id}
          legend={legend}
          onPick={(c) => edit((d) => setChampion(d, c))}
        />
      ) : (
        <>
          <div className="seg builder-tabs" role="tablist">
            {(
              [
                ["mazzo", "Mazzo"],
                ["modifica", "Modifica"],
                ["regole", "Regole"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
              >
                {tab === k && (
                  <motion.span layoutId="builder-tab" className="seg-active" />
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              {tab === "mazzo" && (
                <DeckTab deck={deck} edit={edit} requestAdd={requestAdd} />
              )}
              {tab === "modifica" && (
                <AddTab deck={deck} edit={edit} requestAdd={requestAdd} />
              )}
              {tab === "regole" && <RulesTab deck={deck} />}
            </motion.div>
          </AnimatePresence>
          <StatusBar deck={deck} onIssues={() => setTab("regole")} />
          <ReplaceSheet
            deck={deck}
            card={replacing}
            onClose={() => setReplacing(null)}
            onPick={(outId) => {
              const c = replacing!;
              edit((d) => {
                removeCopy(d, outId);
                addCopy(d, c, db);
              });
              setReplacing(null);
            }}
            onAddAnyway={() => {
              const c = replacing!;
              edit((d) => addCopy(d, c, db));
              setReplacing(null);
            }}
          />
        </>
      )}

      {deck.preset && (
        <button
          type="button"
          className="link-more builder-delete"
          onClick={async () => {
            const ok = await askConfirm({
              title: `Ripristinare “${deck.name}”?`,
              message:
                "Il mazzo torna uguale alla lista ufficiale: le modifiche che hai fatto andranno perse.",
              confirmLabel: "Ripristina",
              danger: true,
            });
            if (!ok) return;
            const presets: { name: string }[] = await fetch(
              asset("data/decks.json"),
            ).then((r) => r.json());
            const original = presets.find(
              (p) => `preset-${p.name.toLowerCase()}` === deck.id,
            );
            if (original)
              saveDeck({
                ...presetToDeck(original as never, db),
                name: deck.name,
              });
          }}
        >
          Ripristina la lista ufficiale
        </button>
      )}

      {!deck.preset && (
        <button
          type="button"
          className="link-more builder-delete"
          onClick={async () => {
            const ok = await askConfirm({
              title: `Eliminare “${deck.name}”?`,
              message:
                "Il mazzo viene cancellato. Le carte nella tua collezione restano.",
              confirmLabel: "Elimina",
              danger: true,
            });
            if (ok) {
              deleteDeck(deck.id);
              navigate("/mazzi");
            }
          }}
        >
          Elimina mazzo
        </button>
      )}
    </div>
  );
}

/** "Ho questo mazzo": aggiunge alla collezione le carte della lista ufficiale del precostruito. */
function OwnedDeckBox({ deck }: { deck: Deck }) {
  const db = useDb();
  const setDeckOwned = useVault((s) => s.setDeckOwned);
  const setDeckReleased = useVault((s) => s.setDeckReleased);
  const [busy, setBusy] = useState(false);
  const added = deck.addedToCollection;
  const total = added ? Object.values(added).reduce((a, b) => a + b, 0) : 0;

  async function add() {
    setBusy(true);
    const presets: { name: string }[] = await fetch(
      asset("data/decks.json"),
    ).then((r) => r.json());
    const original = presets.find(
      (p) => `preset-${p.name.toLowerCase()}` === deck.id,
    );
    if (original)
      setDeckOwned(
        { ...presetToDeck(original as never, db), id: deck.id },
        true,
      );
    setBusy(false);
  }

  return (
    <motion.div layout className={`owned-deck${added ? " owned-deck-on" : ""}`}>
      {added ? (
        <>
          <p>
            <strong>Hai questo mazzo.</strong> Le sue {total} carte (Legend,
            campi e rune compresi) sono nella tua collezione.{" "}
            {deck.released
              ? "Le hai liberate: puoi usarle anche negli altri mazzi."
              : "Restano nella sua scatola: negli altri mazzi non contano finché non le liberi."}
          </p>
          <div className="owned-deck-actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={async () => {
                const ok = await askConfirm(
                  deck.released
                    ? {
                        title: "Rimettere le carte nel mazzo?",
                        message: `Le ${total} carte tornano nella scatola di “${deck.name}”: negli altri mazzi non conteranno più come disponibili.`,
                        confirmLabel: "Rimetti nel mazzo",
                      }
                    : {
                        title: "Liberare le carte?",
                        message: `Le ${total} carte di “${deck.name}” diventano disponibili anche per gli altri mazzi, come se fossero sfuse.`,
                        confirmLabel: "Libera le carte",
                      },
                );
                if (ok) setDeckReleased(deck.id, !deck.released);
              }}
            >
              {deck.released ? "Rimetti nel mazzo" : "Libera le carte"}
            </button>
            <button
              type="button"
              className="link-more"
              onClick={async () => {
                const ok = await askConfirm({
                  title: "Togliere le carte dalla collezione?",
                  message: `Le ${total} carte di questo mazzo vengono tolte dalla collezione. Il mazzo resta in Deck.`,
                  confirmLabel: "Togli",
                  danger: true,
                });
                if (ok) setDeckOwned(deck, false);
              }}
            >
              Togli dalla collezione
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            <strong>Hai comprato questo mazzo?</strong> Aggiungi alla collezione
            tutte le carte della lista ufficiale.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={add}
            disabled={busy}
          >
            Ho questo mazzo
          </button>
        </>
      )}
    </motion.div>
  );
}

function setLegend(d: Deck, legend: Card, db: ReturnType<typeof useDb>) {
  d.legendId = legend.id;
  d.championId = null;
  // Carte fuori dai nuovi domini restano nel mazzo ma vengono segnalate dal validatore.
  // Rune: 6 + 6 dei due domini come punto di partenza (si possono cambiare).
  const runes = uniqueByName(
    db.cards.filter(
      (c) =>
        isRune(c) && c.type === "Basic Rune" && fitsIdentity(c, legend.domains),
    ),
  );
  d.runes = {};
  const per = Math.floor(RUNES_REQUIRED / Math.max(1, runes.length));
  runes.forEach(
    (r, i) =>
      (d.runes[r.id] = per + (i < RUNES_REQUIRED - per * runes.length ? 1 : 0)),
  );
}

/** Aggiunge una copia: se il mazzo ha già la carta con un'altra stampa, aumenta quella. */
function addCopy(d: Deck, c: Card, db: ReturnType<typeof useDb>) {
  if (isBattlefield(c)) {
    if (d.battlefields.length < BATTLEFIELDS_REQUIRED)
      d.battlefields.push(c.id);
    return;
  }
  const id =
    Object.keys(d.main).find((x) => db.byId.get(x)?.name === c.name) ?? c.id;
  d.main[id] = (d.main[id] ?? 0) + 1;
}

function removeCopy(d: Deck, id: string) {
  if ((d.main[id] ?? 0) <= 1) delete d.main[id];
  else d.main[id] -= 1;
}

function setChampion(d: Deck, champ: Card) {
  if (d.championId && d.championId !== champ.id && d.main[d.championId] === 1)
    delete d.main[d.championId];
  d.championId = champ.id;
  d.main[champ.id] = Math.max(1, d.main[champ.id] ?? 0);
}

// ---------------------------------------------------------------------------

function PickerGrid({
  cards,
  onPick,
  ownedNames,
}: {
  cards: Card[];
  onPick: (c: Card) => void;
  ownedNames: Map<string, number>;
}) {
  return (
    <div className="card-grid picker-grid">
      {cards.map((c, i) => (
        <motion.button
          key={c.id}
          type="button"
          className="picker-item"
          onClick={() => onPick(c)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 12) * 0.03 }}
          whileTap={{ scale: 0.96 }}
        >
          <img src={cardImage(c)} alt={c.name} loading="lazy" />
          {ownedNames.get(c.name) ? (
            <span className="thumb-qty">×{ownedNames.get(c.name)}</span>
          ) : null}
        </motion.button>
      ))}
    </div>
  );
}

function LegendPicker({
  deckId,
  onPick,
}: {
  deckId: string;
  onPick: (c: Card) => void;
}) {
  const db = useDb();
  const names = useOwnedNames(deckId);
  const legends = useMemo(
    () =>
      uniqueByName(
        db.cards.filter((c) => isLegend(c) && legendChampionTag(c, db)),
      ),
    [db],
  );
  const mine = legends.filter((l) => names.get(l.name));
  const [onlyMine, setOnlyMine] = useState(mine.length > 0);
  return (
    <section className="section">
      <h2>1. Scegli la Champion Legend</h2>
      <p className="muted picker-help">
        I suoi due domini decidono quali carte puoi mettere nel mazzo (regola
        103.2).
      </p>
      <div className="chips" style={{ margin: "12px 0 16px" }}>
        <button
          className="chip"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine(true)}
        >
          Le mie ({mine.length})
        </button>
        <button
          className="chip"
          aria-pressed={!onlyMine}
          onClick={() => setOnlyMine(false)}
        >
          Tutte ({legends.length})
        </button>
      </div>
      <PickerGrid
        cards={onlyMine ? mine : legends}
        onPick={onPick}
        ownedNames={names}
      />
    </section>
  );
}

function ChampionPicker({
  deckId,
  legend,
  onPick,
}: {
  deckId: string;
  legend: Card;
  onPick: (c: Card) => void;
}) {
  const db = useDb();
  const names = useOwnedNames(deckId);
  const tag = legendChampionTag(legend, db);
  const champs = useMemo(
    () =>
      uniqueByName(
        db.cards.filter(
          (c) => isChampionUnit(c) && tag && c.tags.includes(tag),
        ),
      ),
    [db, tag],
  );
  return (
    <section className="section">
      <h2>2. Scegli il campione</h2>
      <p className="muted picker-help">
        Un’unità campione con il tag {tag}. Inizia la partita nella Champion
        Zone e conta nelle 40 carte (regola 103.3.a).
      </p>
      <div style={{ height: 14 }} />
      <PickerGrid cards={champs} onPick={onPick} ownedNames={names} />
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Copie utilizzabili nel mazzo `deckId`: sfuse più quelle del mazzo stesso (non quelle chiuse in altri mazzi). */
function useAvailable(deckId?: string) {
  const owned = useVault((s) => s.owned);
  const decks = useVault((s) => s.decks);
  return useMemo(
    () => availableCopies(owned, decks, deckId),
    [owned, decks, deckId],
  );
}

function useOwnedNames(deckId?: string) {
  const db = useDb();
  const available = useAvailable(deckId);
  return useMemo(() => ownedByName(db, available), [db, available]);
}

function Row({
  card,
  qty,
  max,
  owned,
  onChange,
  note,
}: {
  card: Card;
  qty: number;
  max: number;
  owned: number;
  onChange: (q: number) => void;
  note?: string;
}) {
  const location = useLocation();
  const missing = Math.max(0, qty - owned);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="row"
    >
      <Link
        to={`/carta/${card.id}`}
        state={{ background: location }}
        className="row-art"
      >
        <img src={cardImage(card)} alt="" loading="lazy" />
      </Link>
      <div className="row-body">
        <p className="row-name">{card.name}</p>
        <p className="row-meta">
          {card.energy != null && <EnergyGlyph value={card.energy} />}
          {card.might != null && (
            <span>
              <MightGlyph /> {card.might}
            </span>
          )}
          {note && <span>{note}</span>}
          {missing > 0 ? (
            <span className="todo">ti mancano {missing}</span>
          ) : owned > 0 ? (
            <span className="ok">ce l’hai</span>
          ) : null}
        </p>
      </div>
      <div className="row-step">
        <button
          type="button"
          onClick={() => onChange(qty - 1)}
          aria-label={`Togli ${card.name}`}
        >
          −
        </button>
        <motion.span
          key={qty}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          className="row-qty"
        >
          {qty}
        </motion.span>
        <button
          type="button"
          onClick={() => onChange(qty + 1)}
          disabled={qty >= max}
          aria-label={`Aggiungi ${card.name}`}
        >
          +
        </button>
      </div>
    </motion.li>
  );
}

const GROUPS: { label: string; test: (c: Card) => boolean }[] = [
  { label: "Campioni", test: (c) => isChampionUnit(c) },
  { label: "Unità", test: (c) => /Unit/.test(c.type) && !isChampionUnit(c) },
  { label: "Magie", test: (c) => /Spell/.test(c.type) },
  { label: "Gear", test: (c) => /Gear/.test(c.type) },
];

function CoreCard({
  card,
  label,
  note,
  owned,
}: {
  card: Card;
  label: string;
  note: string;
  owned: number;
}) {
  const location = useLocation();
  return (
    <Link
      to={`/carta/${card.id}`}
      state={{ background: location }}
      className="core-card"
    >
      <img src={cardImage(card)} alt={card.name} loading="lazy" />
      <span className="core-card-label">{label}</span>
      <span className="core-card-name">{card.name}</span>
      <span className="tiny">{note}</span>
      <span className={`core-card-owned ${owned ? "ok" : "todo"}`}>
        {owned ? "Ce l’hai" : "Non la possiedi"}
      </span>
    </Link>
  );
}

function DeckTab({
  deck,
  edit,
  requestAdd,
}: {
  deck: Deck;
  edit: (fn: (d: Deck) => void) => void;
  requestAdd: (c: Card) => void;
}) {
  const db = useDb();
  const location = useLocation();
  const names = useOwnedNames(deck.id);
  const legend = db.byId.get(deck.legendId!)!;
  const [pickBf, setPickBf] = useState(false);
  const entries = Object.entries(deck.main)
    .map(([id, q]) => [db.byId.get(id), q] as const)
    .filter((e): e is readonly [Card, number] => !!e[0])
    .sort(
      (a, b) =>
        (a[0].energy ?? 0) - (b[0].energy ?? 0) ||
        a[0].name.localeCompare(b[0].name),
    );
  const runeOptions = uniqueByName(
    db.cards.filter(
      (c) => c.type === "Basic Rune" && fitsIdentity(c, legend.domains),
    ),
  );
  const bfOptions = uniqueByName(
    db.cards.filter(
      (c) =>
        isBattlefield(c) &&
        !/Token/.test(c.type) &&
        fitsIdentity(c, legend.domains),
    ),
  );
  const setMain = (id: string, q: number) =>
    edit((d) => {
      if (q <= 0 && id !== d.championId) delete d.main[id];
      else d.main[id] = Math.max(id === d.championId ? 1 : 0, q);
    });

  const champion = deck.championId ? db.byId.get(deck.championId) : undefined;

  return (
    <div className="deck-tab">
      <section className="section">
        <div className="section-head">
          <h2>Legend e campione</h2>
        </div>
        <div className="core-cards">
          <CoreCard
            card={legend}
            label="Champion Legend"
            note="Resta nella Legend Zone, non fa parte del mazzo (103.2.a)"
            owned={names.get(legend.name) ?? 0}
          />
          {champion && (
            <CoreCard
              card={champion}
              label="Campione scelto"
              note="Inizia nella Champion Zone e conta nelle 40 carte (103.3.a)"
              owned={names.get(champion.name) ?? 0}
            />
          )}
        </div>
      </section>

      {GROUPS.map((g) => {
        const rows = entries.filter(([c]) => g.test(c));
        if (!rows.length) return null;
        return (
          <section key={g.label} className="section">
            <div className="section-head">
              <h2>{g.label}</h2>
              <span className="tiny">
                {rows.reduce((a, [, q]) => a + q, 0)}
              </span>
            </div>
            <motion.ul layout className="rows">
              <AnimatePresence initial={false}>
                {rows.map(([c, q]) => (
                  <Row
                    key={c.id}
                    card={c}
                    qty={q}
                    max={isUnique(c) ? 1 : MAX_COPIES}
                    owned={names.get(c.name) ?? 0}
                    onChange={(n) => (n > q ? requestAdd(c) : setMain(c.id, n))}
                    note={
                      c.id === deck.championId
                        ? "Campione scelto"
                        : isSignature(c)
                          ? "Signature"
                          : undefined
                    }
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </section>
        );
      })}

      <section className="section">
        <div className="section-head">
          <h2>Rune</h2>
          <span
            className={
              countOf(deck.runes) === RUNES_REQUIRED ? "tiny ok" : "tiny todo"
            }
          >
            {countOf(deck.runes)} / {RUNES_REQUIRED}
          </span>
        </div>
        <ul className="rows">
          {runeOptions.map((r) => (
            <Row
              key={r.id}
              card={r}
              qty={deck.runes[r.id] ?? 0}
              max={RUNES_REQUIRED}
              owned={names.get(r.name) ?? 0}
              onChange={(n) =>
                edit((d) => {
                  if (n <= 0) delete d.runes[r.id];
                  else d.runes[r.id] = n;
                })
              }
            />
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Campi di battaglia</h2>
          <span
            className={
              deck.battlefields.length === BATTLEFIELDS_REQUIRED
                ? "tiny ok"
                : "tiny todo"
            }
          >
            {deck.battlefields.length} / {BATTLEFIELDS_REQUIRED}
          </span>
        </div>
        <div className="bf-row">
          {deck.battlefields.map((bid) => {
            const b = db.byId.get(bid);
            if (!b) return null;
            return (
              // Toccando la carta si aprono i dettagli; solo la ✕ la toglie dal mazzo
              <div key={bid} className="bf">
                <Link
                  to={`/carta/${b.id}`}
                  state={{ background: location }}
                  className="bf-open"
                >
                  <img src={cardImage(b)} alt="" />
                  <span>{b.name}</span>
                </Link>
                <button
                  type="button"
                  className="bf-x"
                  onClick={() =>
                    edit(
                      (d) =>
                        void (d.battlefields = d.battlefields.filter(
                          (x) => x !== bid,
                        )),
                    )
                  }
                  aria-label={`Togli ${b.name} dal mazzo`}
                >
                  ✕
                </button>
              </div>
            );
          })}
          {deck.battlefields.length < BATTLEFIELDS_REQUIRED && (
            <button
              type="button"
              className="bf bf-add"
              onClick={() => setPickBf((v) => !v)}
            >
              {pickBf ? "Chiudi" : "+ Aggiungi campo"}
            </button>
          )}
        </div>
        <AnimatePresence>
          {pickBf && deck.battlefields.length < BATTLEFIELDS_REQUIRED && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: "hidden" }}
            >
              <BattlefieldPicker
                options={bfOptions.filter(
                  (b) =>
                    !deck.battlefields.some(
                      (x) => db.byId.get(x)?.name === b.name,
                    ),
                )}
                owned={names}
                onPick={(b) => edit((d) => void d.battlefields.push(b.id))}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

const BF_PAGE = 12;

/** Elenco dei campi di battaglia legali, con ricerca per nome, filtro "i miei" e pagine. */
function BattlefieldPicker({
  options,
  owned,
  onPick,
}: {
  options: Card[];
  owned: Map<string, number>;
  onPick: (b: Card) => void;
}) {
  const mineCount = options.filter((b) => owned.get(b.name)).length;
  const [onlyMine, setOnlyMine] = useState(mineCount > 0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const needle = q.trim().toLowerCase();
  const list = options
    .filter((b) => !onlyMine || owned.get(b.name))
    .filter(
      (b) =>
        !needle ||
        b.name.toLowerCase().includes(needle) ||
        cardParagraphs(b.text).some((p) => p.toLowerCase().includes(needle)),
    )
    .sort(
      (a, b) =>
        Number(!!owned.get(b.name)) - Number(!!owned.get(a.name)) ||
        a.name.localeCompare(b.name),
    );
  const shown = list.slice(0, page * BF_PAGE);

  return (
    <div className="bf-picker">
      <div className="search">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Cerca un campo per nome o effetto"
          aria-label="Cerca campi di battaglia"
        />
      </div>
      <div className="chips">
        <button
          className="chip"
          aria-pressed={onlyMine}
          onClick={() => (setOnlyMine(true), setPage(1))}
        >
          I miei ({mineCount})
        </button>
        <button
          className="chip"
          aria-pressed={!onlyMine}
          onClick={() => (setOnlyMine(false), setPage(1))}
        >
          Tutti ({options.length})
        </button>
      </div>
      {list.length === 0 ? (
        <p className="empty">
          Nessun campo trovato.
          {onlyMine && " Prova con “Tutti”: potresti non possederlo."}
        </p>
      ) : (
        <div className="bf-grid">
          {shown.map((b) => (
            <button
              key={b.id}
              type="button"
              className="bf"
              onClick={() => onPick(b)}
            >
              <img src={cardImage(b)} alt="" loading="lazy" />
              <span>
                {b.name}{" "}
                {owned.get(b.name) ? <em className="ok">· ce l’hai</em> : null}
              </span>
            </button>
          ))}
        </div>
      )}
      {shown.length < list.length && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setPage((p) => p + 1)}
        >
          Mostra altri ({list.length - shown.length})
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddTab({
  deck,
  edit,
  requestAdd,
}: {
  deck: Deck;
  edit: (fn: (d: Deck) => void) => void;
  requestAdd: (c: Card) => void;
}) {
  const db = useDb();
  const owned = useAvailable(deck.id);
  const names = useOwnedNames(deck.id);
  const [focus, setFocus] = useState<string[]>([]);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [q, setQ] = useState("");
  const legend = db.byId.get(deck.legendId!)!;
  const themes = useMemo(() => deckThemes(deck, db).slice(0, 10), [deck, db]);
  const suggestions = useMemo(
    () => suggestCards(deck, db, { focus, owned, onlyOwned, limit: 30 }),
    [deck, db, focus, owned, onlyOwned],
  );

  const legal = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const tag = legendChampionTag(legend, db);
    return uniqueByName(
      db.cards.filter(
        (c) =>
          !isLegend(c) &&
          !isRune(c) &&
          !/Token/.test(c.type) &&
          c.type !== "" &&
          fitsIdentity(c, legend.domains) &&
          (!isSignature(c) || (tag && c.tags.includes(tag))) &&
          (c.name.toLowerCase().includes(needle) ||
            cardParagraphs(c.text).some((p) =>
              p.toLowerCase().includes(needle),
            )),
      ),
    ).slice(0, 40);
  }, [q, db, legend]);

  // I campi di battaglia vanno nella loro sezione (3 con nomi diversi, 103.5), il resto nel mazzo principale
  const inDeck = (c: Card) =>
    isBattlefield(c)
      ? deck.battlefields.filter((id) => db.byId.get(id)?.name === c.name)
          .length
      : Object.entries(deck.main).reduce(
          (a, [id, n]) => a + (db.byId.get(id)?.name === c.name ? n : 0),
          0,
        );
  const add = requestAdd;
  const maxFor = (c: Card) =>
    isBattlefield(c)
      ? deck.battlefields.length < BATTLEFIELDS_REQUIRED
        ? 1
        : 0
      : isUnique(c)
        ? 1
        : MAX_COPIES;

  return (
    <div className="add-tab">
      <div className="search" style={{ marginTop: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca una carta o un campo di battaglia legale"
          aria-label="Cerca carte"
        />
      </div>

      {q.trim() ? (
        <ul className="rows" style={{ marginTop: 14 }}>
          {legal.map((c) => (
            <SuggestionRow
              key={c.id}
              card={c}
              inDeck={inDeck(c)}
              owned={names.get(c.name) ?? 0}
              reasons={
                isBattlefield(c) &&
                inDeck(c) === 0 &&
                deck.battlefields.length >= BATTLEFIELDS_REQUIRED
                  ? ["Hai già 3 campi: togline uno per aggiungerlo"]
                  : []
              }
              max={maxFor(c)}
              onAdd={() => add(c)}
            />
          ))}
          {!legal.length && (
            <p className="empty">
              Nessuna carta legale con questo nome o testo.
            </p>
          )}
        </ul>
      ) : (
        <>
          <MetaSwitchList
            deck={deck}
            onSwap={(sw) =>
              edit((d) => {
                removeCopy(d, sw.out.id);
                addCopy(d, sw.in, db);
              })
            }
          />
          <section className="section">
            <div className="section-head">
              <h2>Suggerite per questo mazzo</h2>
            </div>
            <p className="muted picker-help">
              Indizi, non regole: confronto tag e parole chiave della tua
              Legend, del campione e delle carte già nel mazzo. Tocca un tema
              per dargli più peso.
            </p>
            <div className="chips" style={{ margin: "12px 0 4px" }}>
              <button
                className="chip"
                aria-pressed={onlyOwned}
                onClick={() => setOnlyOwned((v) => !v)}
              >
                Solo carte che possiedo
              </button>
              {themes.map((t) => (
                <button
                  key={t.key}
                  className="chip"
                  aria-pressed={focus.includes(t.key)}
                  onClick={() =>
                    setFocus((f) =>
                      f.includes(t.key)
                        ? f.filter((x) => x !== t.key)
                        : [...f, t.key],
                    )
                  }
                >
                  {t.kind === "keyword" ? t.label : `#${t.label}`}
                </button>
              ))}
            </div>
          </section>
          <motion.ul layout className="rows">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.card.id}
                card={s.card}
                inDeck={inDeck(s.card)}
                owned={names.get(s.card.name) ?? 0}
                reasons={s.reasons}
                onAdd={() => add(s.card)}
              />
            ))}
            {!suggestions.length && (
              <p className="empty">Nessun suggerimento con questi filtri.</p>
            )}
          </motion.ul>
        </>
      )}
    </div>
  );
}

let metaPromise: Promise<MetaData | null> | null = null;

/** Statistiche dei tornei (public/data/meta.json); null se il file non c'è. */
function useMeta() {
  const [meta, setMeta] = useState<MetaData | null | undefined>(undefined);
  useEffect(() => {
    metaPromise ??= fetch(asset("data/meta.json"))
      .then((r) => (r.ok ? (r.json() as Promise<MetaData>) : null))
      .catch(() => null);
    let alive = true;
    metaPromise.then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Switch suggeriti dai risultati dei tornei: carte possedute molto giocate al posto di carte poco giocate. */
function MetaSwitchList({
  deck,
  onSwap,
}: {
  deck: Deck;
  onSwap: (s: MetaSwitch) => void;
}) {
  const db = useDb();
  const owned = useAvailable(deck.id);
  const meta = useMeta();
  const location = useLocation();
  const res = useMemo(
    () => (meta ? metaSwitches(deck, db, owned, meta) : null),
    [meta, deck, db, owned],
  );
  if (meta === undefined) return null;
  const legend = db.byId.get(deck.legendId!)!;
  const who = legend.name.split(" - ")[0];
  const date = meta
    ? new Date(meta.generatedAt * 1000).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  return (
    <section className="section">
      <div className="section-head">
        <h2>Switch dai tornei</h2>
        {res?.status === "ok" && (
          <span className="tiny">{res.switches.length}</span>
        )}
      </div>
      <p className="muted picker-help">
        Cosa giocano nei tornei i giocatori con {legend.name} che hanno chiuso
        con più vittorie che sconfitte. È un dato reale, non una garanzia che il
        mazzo migliori.
      </p>
      {res?.status === "ok" && res.weak && (
        <p className="switch-weak">
          Attenzione: solo {res.good}{" "}
          {res.good === 1 ? "lista ben piazzata" : "liste ben piazzate"} di{" "}
          {who} nell’ultimo anno. Con così pochi dati una singola lista sposta
          le percentuali di {pct(1 / res.good)}: prendili come spunti, non come
          conferme.
        </p>
      )}
      {!meta || res?.status === "none" ? (
        <p className="switch-none">
          Nessuna lista di torneo ben piazzata per questa Legend.
        </p>
      ) : res?.status === "ok" && res.switches.length === 0 ? (
        <p className="switch-none">
          Nessuno switch: tra le carte che possiedi nessuna compare in almeno il{" "}
          {pct(META_IN)} delle {res.good} liste ben piazzate di {who} al posto
          di una carta del tuo mazzo che compare al massimo nel {pct(META_OUT)}.
        </p>
      ) : res?.status === "ok" ? (
        <motion.ul layout className="switches">
          <AnimatePresence initial={false}>
            {res.switches.map((s) => (
              <motion.li
                key={`${s.out.id}>${s.in.id}`}
                layout
                className="switch"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="switch-cards">
                  <Link
                    to={`/carta/${s.out.id}`}
                    state={{ background: location }}
                    className="switch-card switch-out"
                  >
                    <img src={cardImage(s.out)} alt="" loading="lazy" />
                    <span>
                      <em>Esce</em>
                      {s.out.name}
                    </span>
                  </Link>
                  <span className="switch-arrow" aria-hidden>
                    →
                  </span>
                  <Link
                    to={`/carta/${s.in.id}`}
                    state={{ background: location }}
                    className="switch-card switch-in"
                  >
                    <img src={cardImage(s.in)} alt="" loading="lazy" />
                    <span>
                      <em>Entra</em>
                      {s.in.name}
                    </span>
                  </Link>
                </div>
                <p className="switch-data">
                  <strong>{s.in.name}</strong> è in {pct(s.shareIn)} delle{" "}
                  {res.good} liste ben piazzate (in media{" "}
                  {s.copiesIn.toLocaleString("it-IT")} copie);{" "}
                  <strong>{s.out.name}</strong> in {pct(s.shareOut)}.
                </p>
                <motion.button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={() => onSwap(s)}
                  whileTap={{ scale: 0.95 }}
                >
                  Scambia
                </motion.button>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : null}
      {meta && (
        <p className="tiny meta-credit">
          Data provided by{" "}
          <a href={meta.sourceUrl} target="_blank" rel="noreferrer">
            TopDeck.gg
          </a>{" "}
          · tornei Constructed dell’ultimo anno, aggiornati al {date}
        </p>
      )}
    </section>
  );
}

/** Con il mazzo già a 40 carte: si sceglie subito quale carta togliere per far posto a quella nuova. */
function ReplaceSheet({
  deck,
  card,
  onClose,
  onPick,
  onAddAnyway,
}: {
  deck: Deck;
  card: Card | null;
  onClose: () => void;
  onPick: (outId: string) => void;
  onAddAnyway: () => void;
}) {
  const db = useDb();
  const owned = useAvailable(deck.id);
  const order = useMemo(
    () =>
      card
        ? replaceOptions(deck, db, owned).filter(
            (o) => o.card.name !== card.name,
          )
        : [],
    [card, deck, db, owned],
  );
  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key="replace"
          className="sheet-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="sheet-scrim"
            aria-label="Chiudi"
            onClick={onClose}
          />
          <motion.div
            className="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
          >
            <span className="sheet-grip" aria-hidden />
            <div className="sheet-body replace-sheet">
              <div className="replace-head">
                <img src={cardImage(card)} alt="" />
                <div>
                  <h2>Con cosa la sostituisci?</h2>
                  <p className="muted">
                    Il mazzo ha già {countOf(deck.main)} carte. Scegli quale
                    togliere per far posto a <strong>{card.name}</strong>. In
                    cima quelle non legali o che non possiedi, poi per costo.
                  </p>
                </div>
              </div>
              <ul className="rows">
                {order.map((o) => (
                  <li key={o.card.id} className="row replace-row">
                    <button
                      type="button"
                      className="replace-pick"
                      onClick={() => onPick(o.card.id)}
                    >
                      <span className="row-art">
                        <img src={cardImage(o.card)} alt="" loading="lazy" />
                      </span>
                      <span className="row-body">
                        <span className="row-name">
                          {o.card.name} <span className="tiny">×{o.qty}</span>
                        </span>
                        <span className="row-meta">
                          {o.card.energy != null && (
                            <EnergyGlyph value={o.card.energy} />
                          )}
                          {o.notes.map((n) => (
                            <span key={n} className="replace-tip">
                              {n}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="link-more replace-anyway"
                onClick={onAddAnyway}
              >
                Aggiungila senza togliere niente ({countOf(deck.main) + 1}{" "}
                carte: il minimo è {MAIN_MIN}, regola 103.3)
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SuggestionRow({
  card,
  inDeck,
  owned,
  reasons,
  onAdd,
  max = isUnique(card) ? 1 : MAX_COPIES,
}: {
  card: Card;
  inDeck: number;
  owned: number;
  reasons: string[];
  onAdd: () => void;
  max?: number;
}) {
  const location = useLocation();
  return (
    <motion.li
      layout
      className="row row-suggest"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Link
        to={`/carta/${card.id}`}
        state={{ background: location }}
        className="row-art"
      >
        <img src={cardImage(card)} alt="" loading="lazy" />
      </Link>
      <div className="row-body">
        <p className="row-name">{card.name}</p>
        <p className="row-meta">
          {card.energy != null && <EnergyGlyph value={card.energy} />}
          <span>{card.type}</span>
          {owned > 0 && <span className="ok">ne hai {owned}</span>}
          {inDeck > 0 && <span>nel mazzo {inDeck}</span>}
        </p>
        {reasons.length > 0 && (
          <ul className="reasons">
            {reasons.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
      <motion.button
        type="button"
        className="add-btn"
        onClick={onAdd}
        disabled={inDeck >= max}
        whileTap={{ scale: 0.85, rotate: 90 }}
        aria-label={`Aggiungi ${card.name}`}
      >
        +
      </motion.button>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------

function RulesTab({ deck }: { deck: Deck }) {
  const db = useDb();
  const owned = useVault((s) => s.owned);
  const decks = useVault((s) => s.decks);
  const issues = validateDeck(deck, db);
  const [open, setOpen] = useState<string | null>(null);
  const cov = ownedCoverage(deck, db, owned, decks);
  return (
    <div className="section">
      {issues.length === 0 ? (
        <div className="legal-ok">
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 14 }}
          >
            ✓
          </motion.span>
          <div>
            <h2>Mazzo legale</h2>
            <p className="muted">
              Rispetta tutte le regole di costruzione del Core Rules (sezione
              103) per il duello 1 contro 1.
            </p>
          </div>
        </div>
      ) : (
        <ul className="issues">
          {issues.map((i, n) => (
            <li key={n} className={`issue issue-${i.level}`}>
              <p>{i.text}</p>
              <button
                type="button"
                className="link-more"
                onClick={() => setOpen(open === `${n}` ? null : `${n}`)}
              >
                Regola {i.rule}
              </button>
              {open === `${n}` && <RuleQuote refs={[i.rule]} />}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ marginTop: 18 }}>
        Delle {cov.need} carte del mazzo principale ne hai a disposizione{" "}
        {cov.have}, contando le sfuse e quelle di questo mazzo (non quelle
        chiuse in altri mazzi che possiedi).
        {cov.need - cov.have > 0
          ? ` Te ne mancano ${cov.need - cov.have}.`
          : ""}
      </p>
    </div>
  );
}

function StatusBar({ deck, onIssues }: { deck: Deck; onIssues: () => void }) {
  const db = useDb();
  const issues = validateDeck(deck, db);
  const main = countOf(deck.main);
  const runes = countOf(deck.runes);
  return (
    <motion.button
      type="button"
      className="status-bar"
      onClick={onIssues}
      initial={{ y: 80 }}
      animate={{ y: 0 }}
    >
      <span className={main >= MAIN_MIN ? "ok" : ""}>
        <motion.strong
          key={main}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
        >
          {main}
        </motion.strong>
        /{MAIN_MIN} carte
      </span>
      <span className={runes === RUNES_REQUIRED ? "ok" : ""}>
        <strong>{runes}</strong>/{RUNES_REQUIRED} rune
      </span>
      <span
        className={
          deck.battlefields.length === BATTLEFIELDS_REQUIRED ? "ok" : ""
        }
      >
        <strong>{deck.battlefields.length}</strong>/{BATTLEFIELDS_REQUIRED}{" "}
        campi
      </span>
      <span className={issues.length ? "status-flag todo" : "status-flag ok"}>
        {issues.length ? `${issues.length} da sistemare` : "Legale"}
      </span>
    </motion.button>
  );
}
