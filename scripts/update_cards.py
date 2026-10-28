"""Scarica la galleria ufficiale di Riftbound e rigenera cards.json + images/.

Uso: python3 scripts/update_cards.py   (dalla cartella del progetto)
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
    out.sort(key=lambda x: (x["set"], x["number"]))
    return out


def download_images(cards):
    os.makedirs("images", exist_ok=True)
    todo = [c for c in cards if not os.path.exists(c["image_file"])]

    def get(c):
        with open(c["image_file"], "wb") as f:
            f.write(fetch(c["image_url"] + IMG_PARAMS))

    with ThreadPoolExecutor(12) as pool:
        list(pool.map(get, todo))
    return len(todo)


if __name__ == "__main__":
    cards = build(gallery_cards())
    with open("cards.json", "w") as f:
        json.dump(cards, f, ensure_ascii=False, indent=1)
    print(f"{len(cards)} carte, {download_images(cards)} immagini nuove scaricate")
