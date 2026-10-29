"""Scarica i risultati dei tornei Riftbound Constructed da TopDeck.gg e scrive public/data/meta.json.

Uso: TOPDECK_API_KEY=... python3 scripts/update_meta.py   (dalla radice del repository)
     python3 scripts/update_meta.py --from risposta.json      (rielabora una risposta già scaricata)

La chiave si crea gratis su https://topdeck.gg/developers e non va mai scritta nel repository.
Si usa solo l'API documentata (https://topdeck.gg/docs/tournaments-v2); le condizioni d'uso
chiedono di mostrare "Data provided by TopDeck.gg" dove l'app usa questi dati.

Nel file finiscono solo statistiche aggregate per Legend, nessun nome di giocatore:
- lists: liste con la Legend negli ultimi DAYS giorni
- good: liste "ben piazzate", cioè con più vittorie che sconfitte nel torneo
- cards: per ogni carta del mazzo principale, in quante liste ben piazzate compare e con quante copie
- model: stima delle vittorie attese (overall del deck builder), allenata solo sui tornei degli
  ultimi MODEL_DAYS giorni perché il meta cambia: con dati più vecchi la stima non prevede più i
  tornei successivi. Per ogni Legend il tasso di vittorie (verso il 50% con KL partite di peso) e,
  per ogni carta, di quanto vincono in più o in meno le liste che la usano (verso 0 con K partite).
  Verifica (ottobre 2026): allenata sui 90 giorni precedenti, prevede i 30 giorni successivi con un
  errore più basso di "50% per tutti" (0,0380 contro 0,0397); le carte migliorano poco la Legend.
"""
import json
import os
import subprocess
import sys
import time
from collections import Counter, defaultdict

DAYS = 365
OUT = "public/data/meta.json"
MODEL_DAYS = 90
KL = 100  # partite di peso a priori per il tasso della Legend
K = 40  # partite di peso a priori per l'effetto di una carta
BETA = 1.0  # peso dell'effetto delle carte (verificato tra 1 e 1,5; si usa il valore prudente)


def fetch():
    key = os.environ.get("TOPDECK_API_KEY")
    if not key:
        sys.exit("Manca TOPDECK_API_KEY")
    body = json.dumps({
        "game": "Riftbound",
        "format": "Constructed",
        "last": DAYS,
        "columns": ["decklist", "wins", "losses", "draws"],
    }).encode()
    # curl come negli altri script: la chiave passa da stdin, non compare tra gli argomenti del processo
    out = subprocess.run(
        ["curl", "-sS", "--fail", "--max-time", "600", "https://topdeck.gg/api/v2/tournaments",
         "-H", "@-", "-H", "Content-Type: application/json", "--data-binary", body.decode()],
        input=f"Authorization: {key}\n", capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def legend_name(deck, leader, known):
    # TopDeck scrive "Vex, Gloomist", il database "Vex - Gloomist"
    legend = next(iter(deck.get("Legend", {})), leader)
    return legend if legend in known else legend.replace(", ", " - ", 1)


def build_model(tournaments, known):
    """Vittorie attese per Legend e carte, dai tornei degli ultimi MODEL_DAYS giorni."""
    end = max(t["startDate"] for t in tournaments)
    rows = []
    for t in tournaments:
        if t["startDate"] <= end - MODEL_DAYS * 86400:
            continue
        for s in t.get("standings", []):
            deck, leader = s.get("deckObj"), s.get("leader")
            w, l = s.get("wins") or 0, s.get("losses") or 0
            if not deck or not leader or w + l < 3:
                continue
            main = {c: e.get("count", 0) for c, e in deck.get("Mainboard", {}).items() if c in known}
            if sum(main.values()) < 30:
                continue
            rows.append((legend_name(deck, leader, known), main, w, l))
    games = defaultdict(lambda: [0, 0])
    for leg, _, w, l in rows:
        games[leg][0] += w
        games[leg][1] += w + l
    rate = {leg: (w + KL * 0.5) / (g + KL) for leg, (w, g) in games.items()}
    acc = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))
    for leg, main, w, l in rows:
        res = w / (w + l) - rate[leg]
        for c in main:
            a = acc[leg][c]
            a[0] += res * (w + l)
            a[1] += w + l
    legends = {}
    for leg, (w, g) in games.items():
        legends[leg] = {
            "rate": round(rate[leg], 4),
            "games": g,
            "cards": {c: round(v[0] / (v[1] + K), 4) for c, v in acc[leg].items() if abs(v[0] / (v[1] + K)) >= 0.0005},
        }
    # riferimento per l'overall: il mazzo con la stima più alta tra quelli dei tornei recenti (99° percentile)
    preds = []
    for leg, main, _, _ in rows:
        tot = sum(main.values())
        cards = legends[leg]["cards"]
        preds.append(rate[leg] + BETA * sum(cards.get(c, 0) * q for c, q in main.items()) / tot)
    preds.sort()
    best = preds[int(len(preds) * 0.99)] if preds else 0.5
    return {"days": MODEL_DAYS, "lists": len(rows), "beta": BETA, "kl": KL, "k": K, "best": round(best, 4), "legends": legends}


def main():
    cards = json.load(open("public/data/cards.json"))
    known = {c["name"] for c in cards}
    tournaments = json.load(open(sys.argv[2])) if sys.argv[1:2] == ["--from"] else fetch()

    lists = Counter()
    good = Counter()
    seen = defaultdict(Counter)  # legend -> carta -> liste ben piazzate che la usano
    copies = defaultdict(Counter)  # legend -> carta -> copie totali in quelle liste
    unknown = Counter()
    for t in tournaments:
        for s in t.get("standings", []):
            deck = s.get("deckObj")
            legend = s.get("leader")
            if not deck or not legend:
                continue
            # TopDeck scrive "Vex, Gloomist", il database "Vex - Gloomist"
            legend = next(iter(deck.get("Legend", {})), legend)
            name = legend if legend in known else legend.replace(", ", " - ", 1)
            lists[name] += 1
            if (s.get("wins") or 0) <= (s.get("losses") or 0):
                continue
            good[name] += 1
            for card, e in deck.get("Mainboard", {}).items():
                if card not in known:
                    unknown[card] += 1
                    continue
                seen[name][card] += 1
                copies[name][card] += e.get("count", 0)

    model = build_model(tournaments, known)
    legends = {}
    for name, n in lists.items():
        g = good[name]
        legends[name] = {
            "lists": n,
            "good": g,
            "cards": {
                card: {"share": round(k / g, 3), "copies": round(copies[name][card] / k, 2)}
                for card, k in sorted(seen[name].items(), key=lambda x: -x[1])
            } if g else {},
        }
        if name in model["legends"]:
            legends[name]["model"] = model["legends"][name]
    out = {
        "source": "TopDeck.gg",
        "sourceUrl": "https://topdeck.gg",
        "format": "Constructed",
        "days": DAYS,
        "generatedAt": int(time.time()),
        "tournaments": len(tournaments),
        "goodRule": "più vittorie che sconfitte nel torneo",
        "model": {k: v for k, v in model.items() if k != "legends"},
        "legends": dict(sorted(legends.items())),
    }
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(tournaments)} tornei, {sum(lists.values())} liste, {len(legends)} Legend -> {OUT}")
    if unknown:
        print("Carte non presenti nel database (ignorate):", ", ".join(f"{c} ({n})" for c, n in unknown.most_common()))


if __name__ == "__main__":
    main()
