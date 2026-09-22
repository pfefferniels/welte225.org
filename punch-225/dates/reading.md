# Reading a punch date off a Welte roll

What the crops show and what to write down. This is the instruction the
readers of `cache/crops/` were given.

## What you are looking at

A stretch of a red Welte-Mignon T-100 roll, scanned at about 300 dpi. The
paper is usually a dark brick red, on some scans a paler buff, and the
writing is pencil or ink, nearly black.

**Each file holds the same crop twice**: the upper panel turned a quarter
turn one way, the lower panel the same picture turned through 180 degrees.
The workshop wrote along the roll in both directions, and only one of the two
panels will read. Look at both before calling a crop blank.

Faint horizontal lines across the paper are the scanner's own, or creases in
a roll that has been played; they are not writing. Large soft brown patches
are damp stains. Rows of white blobs are the perforations.

## What an inscription looks like

The workshop wrote three things, in this order, though any of them can be
missing:

1. the roll's catalogue number, e.g. `225`, `118`, `126`;
2. the date it was punched, day first, e.g. `18 Jan 09`, `14.4.10`,
   `24.10.13`, `1.4.1908`;
3. the puncher, as a name or initials, e.g. `Fritz`, `Roth`, `Sph.`,
   `Wössler`, `Kummer`.

Inscriptions already read off rolls in this corpus, without saying which, so
that no reader meets an answer before the image:

| Reads | Date |
|---|---|
| `225. Fritz. 18 Jan 09.` | 18 January 1909 |
| `225. 14. 114.` | 14 January 1914 |
| `1. 4. 1908.` | 1 April 1908 |
| `118  14.4.10  Roth` | 14 April 1910 |
| `126  24.10.13  Sph. / Wössler` | 24 October 1913 |

Abbreviation is normal and the separators are often dropped: `14114` is
14.1.1914, `311022` is 31.10.1922. A two-digit year is 19xx, so do not reject
a year because it looks early or late.
Later hands on the same paper are not punch dates: a conservator's note of
1987 or 2004 belongs to the archive, not to the workshop, and the century is
usually written out. The day comes first, German fashion, so
`14.4.10` is 14 April, never 4 April. Later rolls are sometimes stamped
rather than written.

One trap in these hands: an 8 is often written as two strokes converging on a
single bottom bowl with the upper loop left open, which taken alone reads as
a 6. Look at the other figures on the same line before settling it.

A second trap, on the stamped rolls: the stamp carries a **fixed mark before
the figures**, a heavy blob that is part of the slug and not a digit. Taken
for an over-inked 1 it adds ten to the day — 8.11.24 read as 18.11.24. The
same mark, with the same detached blob, appears on unrelated rolls, and on
some of them it cannot be a digit without wrecking the date. Where a stamped
date opens with a heavy mark, check whether the figures alone already make a
possible date before counting it.

The dates read so far run from 1904 to 1928.

The number is the roll's, and it need not agree with the catalogue's number
for the title. Where it disagrees, write down what the paper says.

## What to write down

One record per roll, whether or not anything was found:

```json
{
  "druid": "ys288dd6430",
  "region": 1,
  "inscription": "118  14.4.10  Roth",
  "reading": "14.4.10",
  "date_iso": "1910-04-14",
  "roll_number": "118",
  "hand": "Roth",
  "confidence": "high",
  "notes": "pencil, treble edge"
}
```

- `inscription` — everything legible in the crop, names and numbers included,
  as it stands. `null` if nothing is written there.
- `reading` — the date as the paper gives it, not normalised.
- `date_iso` — `YYYY-MM-DD`, or `YYYY-MM` or `YYYY` if that is all that is
  legible, or `null`.
- `roll_number` — the number written on the paper, as written, or `null`.
- `hand` — the name or initials written with the date, as written, or `null`.
  Where a crop carries two, as `Sph.` beside `Wössler`, give both.
- `region` — which crop it was read from, or `null` if none held writing.
- `confidence` — `high` if every figure is plain; `medium` if one figure is
  arguable but the date is not in doubt; `low` if the reading could be a
  different date; `none` if nothing was read.

A roll can carry writing that is not a date at all: a title, a performer's
name, a later owner's note. Record it in `inscription` with
`confidence: "none"` and `date_iso: null`, and say in `notes` what it seems
to be.

Two things to avoid. Do not complete a half-legible date from what the year
ought to be — a wrong date here is worse than none, because the point of the
exercise is to date these copies independently of the catalogue. And do not
take a date from anywhere but the image: Stanford's records carry dates that
belong to other copies of the same title.
