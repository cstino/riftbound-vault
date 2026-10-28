"""Scarica i risultati dei tornei Riftbound Constructed da TopDeck.gg e scrive public/data/meta.json.

Uso: TOPDECK_API_KEY=... python3 scripts/update_meta.py   (dalla radice del repository)

La chiave si crea gratis su https://topdeck.gg/developers e non va mai scritta nel repository.
Si usa solo l'API documentata (https://topdeck.gg/docs/tournaments-v2); le condizioni d'uso
chiedono di mostrare "Data provided by TopDeck.gg" dove l'app usa questi dati.

Nel file finiscono solo statistiche aggregate per Legend, nessun nome di giocatore:
- lists: liste con la Legend negli ultimi DAYS giorni
- good: liste "ben piazzate", cioè con più vittorie che sconfitte nel torneo
- cards: per ogni carta del mazzo principale, in quante liste ben piazzate compare e con quante copie
"""
import json
import os
import subprocess
import sys
import time
from collections import Counter, defaultdict

DAYS = 365
OUT = "public/data/meta.json"


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


def main():
    cards = json.load(open("public/data/cards.json"))
    known = {c["name"] for c in cards}
    tournaments = fetch()

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
    out = {
        "source": "TopDeck.gg",
        "sourceUrl": "https://topdeck.gg",
        "format": "Constructed",
        "days": DAYS,
        "generatedAt": int(time.time()),
        "tournaments": len(tournaments),
        "goodRule": "più vittorie che sconfitte nel torneo",
        "legends": dict(sorted(legends.items())),
    }
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(tournaments)} tornei, {sum(lists.values())} liste, {len(legends)} Legend -> {OUT}")
    if unknown:
        print("Carte non presenti nel database (ignorate):", ", ".join(f"{c} ({n})" for c, n in unknown.most_common()))


if __name__ == "__main__":
    main()
