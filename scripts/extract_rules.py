"""Estrae le regole ufficiali da rules/core-rules-*.txt in public/data/rules.json.

Il .txt si ottiene con `pdftotext -layout` dal PDF del Core Rules (Rules Hub ufficiale).
Uso: python3 scripts/extract_rules.py rules/core-rules-2026-10-09.txt
"""
import json
import re
import sys

RULE = re.compile(r"^(\d{3}(?:\.[0-9a-z]+)*)\.\s+(.*)$")


def parse(path):
    entries = []
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n")
        if not line.strip() or line.strip().startswith("Last Updated"):
            continue
        m = RULE.match(line.strip())
        if m:
            entries.append({"n": m.group(1), "t": re.sub(r"\s+", " ", m.group(2)).strip()})
        elif entries:
            entries[-1]["t"] = (entries[-1]["t"] + " " + re.sub(r"\s+", " ", line).strip()).strip()
    # le voci vuote seguite dal titolo sulla riga dopo restano come titoli di sezione
    return entries


if __name__ == "__main__":
    src = sys.argv[1]
    updated = re.search(r"(\d{4}-\d{2}-\d{2})", open(src, encoding="utf-8").read(400)).group(1)
    entries = parse(src)
    out = {"source": "Riftbound Core Rules", "updated": updated, "rules": entries}
    with open("public/data/rules.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(len(entries), "regole, aggiornate al", updated)
