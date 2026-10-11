# Left out of history/

These scripts trace how the edition's stemma changed over the commits of welte225.org. They read
`edition.jsonld` as it was at each commit with `git show <commit>:edition.jsonld` (see `repo.mjs`).

**They need a clone of welte225.org with its full history.** A shallow clone (as CI checkouts and
`git clone --depth` make them) lacks the early commits; the scripts then print a warning and report only the
commits they find. A blobless clone is enough; git fetches each old edition on first use:

    git clone --filter=blob:none https://github.com/pfefferniels/welte225.org /path/to/w225
    W225_REPO=/path/to/w225 node history.mjs > history.txt

`W225_REPO` defaults to the welte225.org checkout that contains `stemma-225/`.
`history.mjs` takes about 10 s once the blobs are local.

| Left out | Size | What it was |
|---|---|---|
| `hist/` | 410 MB | `edition.jsonld` at each of the 94 commits that changed it, one file per commit; now read directly from git |
| `w225.git` | 24 MB | blobless clone of welte225.org, the source of `hist/`; pass your own clone as `W225_REPO` |
| `lr.git`, `rd.git` | 1.5 MB | blobless clones of linked-rolls and roll-desk, whose logs were read by hand; no script here uses them |

Commit hashes given as arguments (`r3.mjs <commit>...`, and those built into `b1.mjs`) are short hashes of
welte225.org commits. `r4.mjs <siglum>...` and `own.mjs` read only the current edition.
