# wm225.org

The site at the root of `wm225.org`: a landing page for the roll on
which the dissertation *Grünfelds Geist* demonstrates its projects,
and the place where the data about that roll is published.

## What lives where

| Path | Content |
|---|---|
| `/` | the landing page |
| `/edition.jsonld` | the roll edition of WM 225 in the Roll Edition Format, exported from Roll Desk |
| `/symbol_<id>`, `/copy/<id>`, `/<id>` | identifiers of the edition's entities; `404.html` sends them on to Roll Desk, which opens at that entity |

The identifiers are the edition's `@base`, `https://wm225.org/`, so
every `@id` in `edition.jsonld` resolves to a path here. GitHub Pages
serves files only, hence the redirect page for the entity paths. A
machine asking for an entity gets that page with status 404 and a
`rel=alternate` link to the JSON-LD; content negotiation would need
a proxy in front of the domain.

Data of further projects goes into directories of its own, with a
line in the redirect table of `404.html` for their entity paths.

## Publishing the edition

Export the edition from Roll Desk and replace `edition.jsonld`.
Identifiers must not change between exports; the format keeps them.

## DNS

At the registrar, the apex needs the A records of GitHub Pages
(185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153)
and, optionally, the AAAA records (2606:50c0:8000::153 to
2606:50c0:8003::153). `rolldesk` is a CNAME to `pfefferniels.github.io`
and is set as the custom domain of the roll-desk repository.
