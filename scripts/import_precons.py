"""Estrae le liste ufficiali dei mazzi precostruiti dalle pagine di Riot e scrive public/data/products.json.

Uso: python3 scripts/import_precons.py   (dalla radice del repository, serve accesso a playriftbound.com)

Solo prodotti con lista ufficiale pubblicata da Riot. Le carte si collegano al database con il codice
quando la pagina lo riporta (Spiritforged), altrimenti con il nome; i refusi delle pagine ufficiali
sono corretti in TYPOS dopo averli verificati, e qualsiasi nome non riconosciuto fa fallire lo script.
"""
import difflib
import html
import json
import re
import subprocess
import sys
import unicodedata

BASE = "https://playriftbound.com/en-us/news/announcements/"

PRODUCTS = [
    {"id": "sfd-rumble", "name": "Champion Deck: Rumble", "set": "SFD", "kind": "Champion Deck",
     "page": "spiritforged-precons-fiora-rumble", "decks": ["Rumble"]},
    {"id": "sfd-fiora", "name": "Champion Deck: Fiora", "set": "SFD", "kind": "Champion Deck",
     "page": "spiritforged-precons-fiora-rumble", "decks": ["Fiora"]},
    {"id": "unl-vi", "name": "Champion Deck: Vi", "set": "UNL", "kind": "Champion Deck",
     "page": "vi--vex-champion-decks", "decks": ["Vi"]},
    {"id": "unl-vex", "name": "Champion Deck: Vex", "set": "UNL", "kind": "Champion Deck",
     "page": "vi--vex-champion-decks", "decks": ["Vex"]},
    {"id": "ven-showdown", "name": "Showdown Decks: Zed vs Shen", "set": "VEN", "kind": "Showdown Decks",
     "page": "the-vendetta-overview", "decks": ["Zed", "Shen"]},
    {"id": "rad-showdown", "name": "Showdown Decks: Seraphine vs Evelynn", "set": "RAD", "kind": "Showdown Decks",
     "page": "the-radiance-overview", "decks": ["Seraphine", "Evelynn"]},
]

# Refusi nelle pagine ufficiali → nome della carta nel database
TYPOS = {
    "carion dredger": "Carrion Dredger",          # Vi: la carta è "Carrion Dredger" (UNL-153)
    "evelyn entrancing": "Evelynn, Entrancing",   # Vex: manca una "n"
}

# Nomi della lista ufficiale che non corrispondono a nessuna carta e non hanno una correzione ufficiale:
# l'app chiede all'utente di confermare la carta guardando la scatola.
UNCERTAIN = {
    "shadowcloaked assassin": {
        "guess": "Shadowblade Lurker",
        "note": "La lista ufficiale di Zed riporta “Shadowcloaked Assassin”, che non è il nome di nessuna carta. "
                "Probabilmente è Shadowblade Lurker (VEN-096), l'unica carta Chaos di Vendetta con un nome simile.",
    },
}

SECTIONS = {
    "legend": "legend",
    "champion options": "champion",
    "champion unit options": "champion",
    "main deck": "main",
    "cards": "main",
    "battlefields": "battlefield",
    "rune pool": "rune",
    "runes": "rune",
    "tokens": None,
}


def fetch(url):
    return subprocess.run(["curl", "-sfL", "-m", "120", url], check=True, capture_output=True).stdout.decode()


def page_lines(slug):
    h = fetch(BASE + slug + "/")
    h = re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", h))
    lines = [re.sub(r"\s+", " ", l).strip() for l in t.split("\n")]
    # le intestazioni a volte sono spezzate in "Battlefields" + ":"
    out = []
    for l in lines:
        if not l:
            continue
        if l == ":" and out:
            out[-1] += ":"
            continue
        out.append(l)
    cut = out.index("Related Articles") if "Related Articles" in out else len(out)
    return out[:cut]


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower()).replace("’", "'").replace("‘", "'")
    return re.sub(r"[^a-z0-9']+", " ", s).strip()


class Matcher:
    def __init__(self, cards):
        self.by_code = {c["code"]: c for c in cards}
        base = sorted(cards, key=lambda c: (c["alt_art"] or c["signature"], c["set"], c["number"]))
        self.by_name = {}
        for c in base:
            if "Token" in c["type"]:
                continue
            keys = [c["name"], c["short_name"]]
            if " - " in c["name"]:
                champ, rest = c["name"].split(" - ", 1)
                keys += [rest, f"{champ}, {rest}"]
            for k in keys:
                self.by_name.setdefault(norm(k), c)
        self.fuzzy = []

    def name(self, raw, section):
        n = norm(raw)
        if section == "rune" and not n.endswith("rune"):
            n += " rune"
        n = norm(TYPOS.get(n, n))
        if n in self.by_name:
            return self.by_name[n]
        close = difflib.get_close_matches(n, self.by_name.keys(), n=1, cutoff=0.88)
        if close:
            self.fuzzy.append((raw, self.by_name[close[0]]["name"]))
            return self.by_name[close[0]]
        return None


def parse_named(lines, deck_names, m):
    """Liste in formato "N Nome" con intestazioni (Vi/Vex, Vendetta, Radiance)."""
    decks, cur, section, missing = {}, None, None, []
    for l in lines:
        head = l.rstrip(":").strip().lower()
        title = re.match(r"(\w+) Preconstructed Decklist", l)
        if title:
            cur = title.group(1)
            decks[cur] = []
            section = None
            continue
        if head in SECTIONS and l.endswith(":"):
            section = SECTIONS[head]
            # Vi/Vex non hanno un titolo: il mazzo inizia con "Legend:"
            if section == "legend" and (cur is None or decks.get(cur)):
                if cur is None or any(e["section"] == "legend" for e in decks[cur]):
                    cur = f"#{len(decks)}"
                    decks[cur] = []
            continue
        if cur is None or section is None:
            continue
        mm = re.match(r"^(\d+)\s+(.+)$", l)
        qty, name = (int(mm.group(1)), mm.group(2)) if mm else (1, l)
        if section in ("legend", "battlefield") and mm is None and len(l) > 60:
            continue
        unsure = UNCERTAIN.get(norm(name))
        if unsure:
            guess = m.name(unsure["guess"], section)
            decks[cur].append({"id": guess["id"], "qty": qty, "section": section,
                               "uncertain": {"printed": name, "note": unsure["note"]}})
            continue
        card = m.name(name, section)
        if card is None:
            missing.append(f"{cur}: {l}")
            continue
        decks[cur].append({"id": card["id"], "qty": qty, "section": section})
    # Vi/Vex: i mazzi senza titolo prendono il nome dal campione della Legend
    named = {}
    for k, entries in decks.items():
        if k.startswith("#"):
            leg = next((e for e in entries if e["section"] == "legend"), None)
            k = m_by_id[leg["id"]]["name"].split(" - ")[0] if leg else k
        named[k] = entries
    return {d: named[d] for d in deck_names if d in named}, missing


def parse_table(lines, deck_names, m):
    """Tabelle ITEM / QTY / Card Number (Spiritforged): si usa il codice."""
    decks, cur, missing = {}, None, []
    i = 0
    while i < len(lines):
        l = lines[i]
        if l in deck_names and i + 1 < len(lines) and l not in decks:
            cur = l
            decks[cur] = []
        if cur and i + 2 < len(lines) and re.fullmatch(r"\d+", lines[i + 1]) and re.fullmatch(r"[A-Z]{3}-[\w*]+(/\d+)?", lines[i + 2]):
            code, qty = lines[i + 2], int(lines[i + 1])
            if re.fullmatch(r"[A-Z]{3}-T\d+", code):  # token: la collezione non li conta
                i += 3
                continue
            card = m.by_code.get(code)
            if card is None:
                missing.append(f"{cur}: {l} {code}")
            elif "Token" not in card["type"]:
                t = card["type"]
                section = ("legend" if "Legend" in t else "battlefield" if "Battlefield" in t
                           else "rune" if "Rune" in t else "champion" if t == "Champion Unit" else "main")
                if card["name"] != l and norm(card["short_name"]) != norm(l):
                    m.fuzzy.append((f"{l} ({code})", card["name"]))
                decks[cur].append({"id": card["id"], "qty": qty, "section": section})
            i += 3
            continue
        i += 1
    return decks, missing


if __name__ == "__main__":
    cards = json.load(open("public/data/cards.json"))
    m_by_id = {c["id"]: c for c in cards}
    m = Matcher(cards)
    pages, out, all_missing = {}, [], []
    for p in PRODUCTS:
        if p["page"] not in pages:
            lines = page_lines(p["page"])
            table = "Card Number" in lines
            pages[p["page"]] = (parse_table if table else parse_named)(lines, sum((q["decks"] for q in PRODUCTS if q["page"] == p["page"]), []), m)
        decks, missing = pages[p["page"]]
        all_missing += missing
        out.append({
            "id": p["id"], "name": p["name"], "set": p["set"], "kind": p["kind"],
            "source": BASE + p["page"] + "/",
            "decks": [{"name": d, "cards": decks.get(d, [])} for d in p["decks"]],
        })
    for raw, name in m.fuzzy:
        print(f"nome corretto: {raw!r} -> {name!r}")
    if all_missing:
        print("NON RICONOSCIUTE:", *sorted(set(all_missing)), sep="\n  ")
        sys.exit(1)
    json.dump(out, open("public/data/products.json", "w"), ensure_ascii=False, indent=1)
    for p in out:
        for d in p["decks"]:
            n = {s: sum(e["qty"] for e in d["cards"] if e["section"] == s) for s in ("legend", "champion", "main", "battlefield", "rune")}
            print(p["id"], d["name"], n)
