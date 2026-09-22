"""Which market each roll was labelled for, from the language of its leader title.

    python3 labels.py

Stanford transcribed each roll's title from the roll itself — 442 of the 456
records say "Title from roll." — so the title is the printed leader label, and
its language says which market the copy was labelled for: "As-dur", "II. Satz",
"IX. Rhapsodie" against "A flat major", "2nd movement", "13th rhapsody".

The obvious use is to ask which perforator stood where. It does not answer
that. Across the corpus the wide punch looks German and the narrow punch
English, but the German share falls with the date whichever machine cut the
copy, and the narrow machine is the one running in the 1920s. Within the same
years both machines made rolls for both markets. Labels also need not be
contemporary with the punching: a leader can be re-labelled and a roll sold
years after it was cut, which is the likeliest reason the narrow machine has a
German-labelled roll of August 1918 and an English-labelled one of April 1917.

Titles taken from the box or from a rollography are left out, since they need
not match the copy's own label. A title that is only a proper name or a French
form ("Berceuse", "Valse mignonne") is left unclassified.

Prints the tables; writes nothing.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import condon

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "cache"

ENGLISH = [
    r"\bmajor\b", r"\bminor\b", r"\bflat\b", r"\bsharp\b", r"\b\d+(st|nd|rd|th)\b",
    r"\bconcerto\b", r"\bsonata\b", r"\bsymphon(y|ic)\b", r"\brhapsody\b", r"\bprelude\b",
    r"\boverture\b", r"\bmarch\b", r"\bwaltz", r"\bdance", r"\bsong\b", r"\bfrom\b", r"\band\b",
    r"\bthe\b", r"\bof\b", r"\bwith\b", r"played by", r"\bhungarian\b", r"\bspanish\b",
    r"\bpolish\b", r"\bpart\b", r"\bmovement\b", r"\bfuneral\b",
    r"fox.?trot", r"one.?step", r"two.?step", r"\brag\b", r"\bblues\b", r"\bselections?\b",
    r"\bvariations\b",
]
GERMAN = [
    r"\bdur\b", r"\bmoll\b", r"-dur\b", r"-moll\b", r"\bwalzer", r"\brhapsodie\b", r"\bsonate\b",
    r"\bkonzert", r"\bvorspiel\b", r"\bouvert[üu]re\b", r"\bmarsch\b", r"\bt[äa]nze?\b",
    r"\blied(er)?\b", r"\bsatz\b", r"\bungarische", r"\bpolnische", r"\bspanische", r"\betüde",
    r"\bpräludium\b", r"\bder\b", r"\bdie\b", r"\bdas\b", r"\bdes\b", r"\bdem\b", r"\bden\b",
    r"\bund\b", r"\baus\b", r"\bmit\b", r"\bvon\b", r"\bzu\b", r"\bim\b", r"\bvom\b", r"\bnr\.",
]
GERMAN_ORDINAL = r"\b\d+\.\s+[A-ZÄÖÜ]\w+"      # "12. Rhapsodie"; case matters, so kept apart

PERIODS = (("before 1911", "0000", "1911"), ("1911-1914", "1911", "1915"),
           ("1915-1919", "1915", "1920"), ("1920-1928", "1920", "1929"))


def language(title: str) -> str:
    english = any(re.search(p, title, re.I) for p in ENGLISH)
    german = any(re.search(p, title, re.I) for p in GERMAN) or bool(re.search(GERMAN_ORDINAL, title))
    if english and german:
        return "both"
    return "English" if english else "German" if german else "neither"


def title_of(entry: dict) -> str:
    return entry.get("value") or " ".join(part.get("value", "") for part in entry.get("structuredValue", []))


def leader_titles() -> dict[str, str]:
    """Each roll's title, where Stanford took it from the roll itself."""
    out = {}
    for path in CACHE.glob("*_purl.json"):
        description = json.loads(path.read_text()).get("description", {})
        notes = " ".join(note.get("value") or "" for note in description.get("note", []))
        main = [t for t in description.get("title", []) if not t.get("type")]
        if main and re.search(r"title from roll", notes, re.I):
            out[path.name.removesuffix("_purl.json")] = title_of(main[0])
    return out


def main() -> None:
    titles = leader_titles()
    pitch = {r["druid"]: r["pitch"] for r in json.loads((HERE / "pitch.json").read_text()) if r.get("pitch")}
    records = {r["druid"]: r for r in condon.records()}

    def machine(druid: str) -> str:
        return "wide" if pitch[druid] >= 2.75 else "narrow"

    counted = Counter(language(t) for t in titles.values())
    print("%d leader titles: %s" % (len(titles), dict(counted)))

    by_machine: dict[str, Counter] = defaultdict(Counter)
    for druid, title in titles.items():
        if druid in pitch:
            by_machine[machine(druid)][language(title)] += 1
    print("\nwhole corpus        German  English   German share")
    for name, c in sorted(by_machine.items()):
        n = c["German"] + c["English"]
        print("  %-16s %6d %8d        %3.0f%%" % (name, c["German"], c["English"], 100 * c["German"] / n))

    print("\nwithin one period   German  English   German share")
    for label, low, high in PERIODS:
        for name in ("wide", "narrow"):
            c = Counter(
                language(t) for d, t in titles.items()
                if d in pitch and machine(d) == name
                and records.get(d, {}).get("confidence") in ("high", "medium")
                and low <= (records[d].get("date_iso") or "") < high
            )
            n = c["German"] + c["English"]
            if n:
                print("  %-10s %-6s %6d %8d        %3.0f%%" % (label, name, c["German"], c["English"],
                                                             100 * c["German"] / n))


if __name__ == "__main__":
    main()
