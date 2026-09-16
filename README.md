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

A siglum is a name, given once and not changed. A version's letter names
the line it was first recognised in and its number counts the versions
admitted to that line; where later work places a version elsewhere in the
stemma, `basedOn` changes and the siglum stays. A copy's siglum is two
letters for the collection it was read in and a number counting the copies
of the roll held there. A siglum once given is not given again.

| Version | System | Given | |
|---|---|---|---|
| A | T-100 | 4 Sept 2026 (`d38874b`) | no copy carries it; the 1963 recording Si1 is said to |
| A1 | T-100 | 4 Sept 2026 (`d38874b`) | |
| B | T-100 | 4 Sept 2026 (`d38874b`) | |
| C | T-100 | 4 Sept 2026 (`d38874b`) | |
| B1 | T-100 | 10 Sept 2026 (`56cc1d0`) | dissolved into B on 15 Sept 2026 (`1a7b95d`); not given again |
| D1 | Licensee | 10 Sept 2026 (`56cc1d0`) | |
| D2 | T-98 | 10 Sept 2026 (`56cc1d0`) | |
| C1 | T-100 | 14 Sept 2026 (`64900d4`) | called C_S until that day |
| B2 | T-100 | 15 Sept 2026 (`04ea9dc`) | no copy carries it |
| D3 | Licensee | 15 Sept 2026 (`04ea9dc`) | |

The letter D names the copies issued for another reproducing system, the
group admitted on 10 September 2026. D3 joined that group although it
derives from B2, which C also derives from.

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

The copies took these sigla on 16 September 2026 (`e0868e6`). The
dissertation called them S1, S2, W, C, P, B, G, Sc and Si before that day.

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
