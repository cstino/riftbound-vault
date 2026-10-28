"""Scarica la galleria ufficiale di Riftbound e rigenera public/data/cards.json + images/ (archivio, non pubblicato).

Uso: python3 scripts/update_cards.py   (dalla radice del repository)
Richiede accesso a playriftbound.com e cmsassets.rgpub.io.
Scarica solo le immagini che mancano.
"""
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor

GALLERY = "https://playriftbound.com/en-us/card-gallery/"
IMG_PARAMS = "?w=500&fm=webp&q=82"
PUBLIC = "public"
CARDS = os.path.join(PUBLIC, "data", "cards.json")


def fetch(url):
    # curl invece di urllib: alcuni host rispondono 403 allo user-agent di Python
    return subprocess.run(["curl", "-sfL", "-m", "120", "--retry", "3", url],
                          check=True, capture_output=True).stdout


def gallery_cards():
    html = fetch(GALLERY).decode("utf-8")
    data = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S).group(1))
    found = {}

    def walk(x):
        if isinstance(x, dict):
            if "publicCode" in x and "name" in x:
                found[x["id"]] = x
                return
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(data)
    return list(found.values())


def value(c, key):
    x = c.get(key)
    return x["value"]["id"] if x and x.get("value") else None


def build(raw):
    champions = {c["name"] for c in raw
                 if any(x["id"] == "champion" for x in (c["cardType"].get("superType") or []))}
    out = []
    for c in raw:
        # il nome completo dei campioni ("Seraphine, Not Alone") c'è solo nel testo di accessibilità
        alt = c["cardImage"].get("accessibilityText", "")
        m = re.match(r"Riftbound [^:]+: (.+?)\.(\s|$)", alt)
        name = m.group(1) if m and m.group(1).startswith(c["name"]) else c["name"]
        types = [x["label"] for x in c["cardType"]["type"]]
        supertypes = [x["label"] for x in c["cardType"].get("superType") or []]
        # Nella galleria alcuni tipi di Radiance sono sbagliati o vuoti (es. Burn Away indicata come Gear,
        # sulla carta è Spell); il testo di accessibilità riporta il tipo stampato.
        acc_type = re.match(r"Riftbound ([^:,]+):", alt)
        if acc_type and acc_type.group(1) not in ("None",) and [acc_type.group(1)] != types:
            types = [acc_type.group(1)]
        tags = c["tags"]["tags"] if c.get("tags") else []
        if "Legend" in types:
            champ = [t for t in tags if t in champions]
            if champ:
                name = f"{champ[0]} - {name}"
        set_code, rest = c["publicCode"].split("-", 1)
        number, _, size = rest.partition("/")
        out.append(dict(
            id=c["id"], code=c["publicCode"], set=set_code, set_name=c["set"]["value"]["label"],
            number=number, set_size=int(size) if size.isdigit() else None,
            name=name, short_name=c["name"], type=" ".join(supertypes + types),
            rarity=c["rarity"]["value"]["label"] if c.get("rarity") else None,
            domains=[x["label"] for x in c["domain"]["values"]] if c.get("domain") else [],
            energy=value(c, "energy"), power=value(c, "power"), might=value(c, "might"), tags=tags,
            text=((c.get("text") or {}).get("richText") or {}).get("body"),
            artist=", ".join(x["label"] for x in (c.get("illustrator") or {}).get("values", [])) or None,
            alt_art=number.endswith("a"), signature=number.endswith("*"),
            image_url=c["cardImage"]["url"].split("?")[0], image_file=f"images/{c['id']}.webp",
        ))
    fix_radiance_domains(out)
    out.sort(key=lambda x: (x["set"], x["number"]))
    return out


DOMAIN_BLOCKS = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"]


def fix_radiance_domains(cards):
    """Corregge i domini di Radiance (RAD), sbagliati in molte carte della galleria.

    Come in Vendetta (stessa struttura), le carte 001-138 sono numerate per dominio in blocchi da 23:
    001-023 Fury, 024-046 Calm, 047-069 Mind, 070-092 Body, 093-115 Chaos, 116-138 Order.
    Verificato sul colore della fascia del nome nelle immagini e sulle liste ufficiali dei mazzi
    precostruiti (es. Elnuk Herd, RAD-081, è Body ed è nel mazzo Evelynn Body/Chaos).
    Alt art e stampe extra prendono il dominio della carta base con lo stesso nome.
    """
    base = {}
    for c in cards:
        if c["set"] != "RAD" or not re.fullmatch(r"\d{3}", c["number"]):
            continue
        n = int(c["number"])
        if 1 <= n <= 138:
            c["domains"] = [DOMAIN_BLOCKS[(n - 1) // 23]]
            base[c["name"]] = c["domains"]
    for c in cards:
        main_set = re.fullmatch(r"\d{3}", c["number"]) and int(c["number"]) <= 138
        if c["set"] == "RAD" and not main_set and c["name"] in base:
            c["domains"] = base[c["name"]]


def download_images(cards):
    os.makedirs("images", exist_ok=True)
    todo = [c for c in cards if not os.path.exists(c["image_file"])]

    def get(c):
        with open(c["image_file"], "wb") as f:
            f.write(fetch(c["image_url"] + IMG_PARAMS))

    with ThreadPoolExecutor(12) as pool:
        list(pool.map(get, todo))
    return len(todo)


def merged_cards(fetches=3):
    # la galleria a volte omette qualche carta: unisce più download e non cancella mai
    # le carte già presenti in cards.json
    raw = {}
    for _ in range(fetches):
        raw.update({c["id"]: c for c in gallery_cards()})
    fresh = {c["id"]: c for c in build(list(raw.values()))}
    if os.path.exists(CARDS):
        with open(CARDS) as f:
            for c in json.load(f):
                fresh.setdefault(c["id"], c)
    return sorted(fresh.values(), key=lambda x: (x["set"], x["number"]))


if __name__ == "__main__":
    cards = merged_cards()
    with open(CARDS, "w") as f:
        json.dump(cards, f, ensure_ascii=False, indent=1)
    print(f"{len(cards)} carte, {download_images(cards)} immagini nuove scaricate")
