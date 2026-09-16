# welte225.org

The site at the root of `welte225.org`: a landing page for the roll on
which the dissertation *Grünfelds Geist* demonstrates its projects,
and the place where the data about that roll is published.

## What lives where

| Path | Content |
|---|---|
| `/` | the landing page |
| `/edition.jsonld` | the roll edition of WM 225 in the Roll Edition Format, exported from Roll Desk |
| `/<id>` | identifiers of the edition's entities, whatever they are: a version, a copy, a symbol (whose id reads `symbol_<uuid>`), a feature, an edit, a motivation, a belief. `404.html` sends them on to Roll Desk, which opens at that entity |
| `/mpm/` | the roll's performance reconstructed as Music Performance Markup, exported from MPM Desk |
| `/mpm/<id>` | identifiers of the reconstruction's segments; `404.html` sends them on to MPM Desk, which opens at that segment |
| `/schmitz-225/` | the comparison of TACET's recording of Hans-W. Schmitz's copy with the edition's versions: scripts and derived data, cited by the edition's beliefs about that copy |
| `/licensee-225/` | the comparison of Peter Phillips's and Philippe Gourlin's Licensee copies with the edition's versions: scripts and derived data, cited by the edition's beliefs about version D3, the lost state B2 and Gourlin's copy |
| `/simonton-225/` | the comparison of the 1962/63 recording from Richard C. Simonton's copy with the edition's versions: scripts and derived data, cited by the edition's beliefs about that copy |

The identifiers are the edition's `@base`, `https://welte225.org/`, so
every `@id` in `edition.jsonld` resolves to a path here. GitHub Pages
serves files only, hence the redirect page for the entity paths. A
machine asking for an entity gets that page with status 404 and a
`rel=alternate` link to the JSON-LD; content negotiation would need
a proxy in front of the domain.

An entity is named by its id alone. Until September 2026 a copy was
named `copy/<id>`; both the redirect page and Roll Desk still read that,
so links given out then keep working. Since the ids are not all UUIDs –
a motivation goes by a word – the redirect page sends on anything shaped
like an identifier and lets Roll Desk, which holds the ids, say where it
knows none.

Data of further projects goes into directories of its own, with a
line in the redirect table of `404.html` for their entity paths.

## Publishing the edition

`edition.jsonld` is the only copy of the edition. Roll Desk loads it
from this repository and does not bundle one of its own; the test
sample in linked-rolls is a frozen export of an earlier format
version, not the edition. To publish a change, export the edition
from Roll Desk and replace the file here. Identifiers must not change
between exports; the format keeps them.

## Sigla

Identity rests in the IRI. A siglum is a label generated from the stemma
as it stands, so it changes when the stemma does. Whoever cites one names
the state it belongs to, and whoever needs precision cites the IRI.

A version's letter names the reproducing system it is coded for, its
number counts the generations within that system, and an appended number
marks a branch that leaves a generation. A transfer starts the first
generation of its own system, which is why the Licensee versions count
from one. Where several transfers enter one system, they count by the
generation they derive from. The main line here is the T-100 chain the
other systems derive from.

A copy's siglum does not change: two letters for the collection the copy
was read in, and a number counting the copies of the roll held there. A
copy is an object rather than a hypothesis, and stays the same copy
whatever the stemma does.

Sigla of the stemma of 16 September 2026:

| Version | System | Derives from | Formerly |
|---|---|---|---|
| R1 | T-100 | – | A; no copy carries it, the 1963 recording Si1 is said to |
| R2 | T-100 | R1 | B |
| R3 | T-100 | R2 | B2; no copy carries it |
| R4 | T-100 | R3 | C |
| R1.1 | T-100 | R1 | A1 |
| R4.1 | T-100 | R4 | C1, called C_S until 14 Sept 2026 |
| L1 | Licensee | R3 | D3 |
| L2 | Licensee | R4 | D1 |
| G1 | T-98 | R4 | D2 |

| Copy | Read in | Roll |
|---|---|---|
| St1 | Stanford University Archive | Condon Roll 47, red T-100 |
| St2 | Stanford University Archive | Condon Roll 48, red T-100 |
| Wi1 | Marc Widuch | red T-100 |
| Ch1 | scanned by Spencer Chase, collection unknown | Licensee |
| Bo1 | Peter Both, scanned by Julian Dyer | green T-98 |
| Ph1 | Peter Phillips | Licensee |
| Go1 | Philippe Gourlin, read by Warren Trachtman | Licensee |
| Sc1 | Hans-W. Schmitz | red T-100, known from TACET's recording |
| Si1 | Richard Simonton, now USC Libraries | red T-100, known from the 1963 recording |

Labels used earlier: the copies were named on 16 September 2026
(`e0868e6`), and the dissertation called them S1, S2, W, C, P, B, G, Sc
and Si before that day. B1 stood between 10 and 15 September 2026 for
readings then given to Stanford's first copy alone; it was dissolved into
R2 (`1a7b95d`), and two notes still mention it where they report that
earlier attribution. The word ids of motivations (`cleanup-b2`,
`cleanup-d3`) are identifiers and keep the letters of the labels current
when they were minted.

## Publishing the reconstruction

`mpm/` holds the four files of an MPM Desk archive, unzipped: the
transcription with its recordings (`transcription.mei`), the work file
of transformer calls and claims (`work.json`), the MPM the chain wrote
(`performance.mpm`) and the score it is performed against
(`score.msm`). The viewer at `mpmdesk.welte225.org` loads them from
here and bundles none. To publish a change made in the editor, replace
the files. After a change to the chain, `scripts/recordOutcomes.ts` in
mpm-desk rewrites the last three in a checkout of this repository, and
mpm-desk's tests read that checkout.

A segment of the reconstruction, one claim about a stretch of the
performance, has the identifier `https://welte225.org/mpm/<id>`, its
`id` in `work.json` being a UUID the editor mints. A prefix of at least
eight characters names the segment as well, as long as no second
segment shares it; the viewer settles the address on the identifier.
Identifiers must not change between exports.

## DNS

At the registrar, the apex needs the A records of GitHub Pages
(185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153)
and, optionally, the AAAA records (2606:50c0:8000::153 to
2606:50c0:8003::153). `rolldesk` is a CNAME to `pfefferniels.github.io`
and is set as the custom domain of the roll-desk repository.
