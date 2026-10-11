# Deriving the stemma of WM 225 from its copies

An exploratory test of whether the stemma of the edition can be derived
automatically and deterministically from the transcribed copies: which
versions there are, lost ones included, which edits belong to which
version, and how the versions derive from each other. Motivations, edit
types and beliefs are left to the editor and are not part of the test.

It was run on 11 October 2026 against `edition.jsonld` as of `47a6238`
(version 1.0.5) and linked-rolls 0.71.0. The edition cites none of it.

## In brief

Largely yes, for the six copies whose features are transcribed (St1,
St2, Wi1, Ch1, Bo1, Ne1). The pipeline below, run blind on the features
alone, gives the edition's stemma exactly and puts 96–99 % of the
symbols into the version the editor put them in. It does so only with
rules beyond the five of `rules.html`, and with parameters that were
fitted to this one edition. Recordings (Sc1, Si1), the emulated MIDI
file of Go1, the statement-only version r5 and the reading of a conflict
as contamination stay with the editor.

| Step | Automatic? | Agreement with the edition |
|---|---|---|
| Alignment of the copies | already | every stored shift and scale reproduced exactly |
| Collation into readings | yes, all copies at once, order-independent | 1372/1428 symbols (96.1 %), 9604/9628 pairs of readings (99.75 %) |
| Versions and derivations | yes, with three added rules (see below) | the edition's tree, on its own symbols and on the blind collation |
| Edits to versions, given the tree | yes, with one window parameter | 1415/1428 insertions, 635/655 deletions (blind: 1373/1409) |
| Witnesses by statement (Sc1, Si1, Go1), r5 | no | – |
| Contamination L1 ← r1 | the conflict is found, not its reading | – |

## The steps

**Alignment.** `alignFeatures` already reproduces every stored shift and
scale (difference 0.0000 mm).

**Collation.** Every copy's readings are matched against every other
copy's. Two readings are joined when they have the same key and both
ends fall within the scatter window of that pair of copies. Clusters are
formed by single linkage, nearest pair first, and never hold two
readings of one copy. The result does not depend on the order of the
copies: shuffled inputs give the identical partition.

The library's progressive collation does depend on that order. Attaching
copies one after another with `collationsOf`, as `connectVersions` does,
gives 352 different results across the 720 orders of six copies at
5 mm. It presupposes the stemma it would have to find.

The blind collation disagrees with the edition at 30 places (56
symbols):
- 5 Ne1 readings that the edition joins at 6–7.7 mm, under L1's 8 mm window;
- 12 window edge cases;
- 13 decisions made from the stemma or from what a reading means.

Bo1 is linked to the red readings through `substitutionsBetween`. It
reproduces 205 of the edition's 210 two-sided recodings. Between 3.5
and 8 mm the presence patterns barely change (29–136 of 4789 readings),
and below about 3 mm the matrix breaks down.

**Versions and derivations.** Each reading becomes a character, present,
absent or unknown in each copy. A copy cannot testify before its leader
ends or where it is torn, and Bo1's recoded expressions are read through
the recoding links. Every rooted tree over the six copies is then scored:
91,984 trees, lost nodes and copies standing at inner nodes (sampled
ancestors) included, 22,472 after the rule that a Licensee or green text
is not the ancestor of a red one.

- Read literally as Dollo parsimony, shared-addition and
  independent-cleanup root the tree correctly: an unobserved r1, Wi1 off
  it. But they lose r3. Sixteen R2 readings that Ne1 lacks (`11.11.`)
  outweigh the eleven r3 readings that St1 lacks (`.1.111`), so Ne1
  branches off before St1. The edition's tree ranks 35th (+33.25, with
  a gain costing 10 and a loss 1).
- The editor's own argument, that Ne1 carries 155 of R2's 172 additions,
  does not decide either, because it is symmetric: St1 carries 151 of
  the 162 readings Ne1 and St2 share without Wi1. It works only once St1
  is taken to be R2.
- **What decides r3 is a rule the edition applies but does not state:** a
  loss on a transfer to another system counts for less (κ), because the
  re-cut was an editorial pass of its own. Two further rules complete the
  tree. A copy may lack a reading of the version it carries (cdev), as
  St1 lacks the crescendo at 1741.8 mm. And every lost state has a cost
  (λ).
- With κ = 0.25, cdev = 1 and λ = 4, the edition's tree is the unique
  optimum, on the edition's symbols and on the blind collation alike. The
  runner-up is +2.0; the best tree without r3 is +4.1 and +5.8. Under
  1–2 % random noise, r1, St1 = R2, r3 and Ne1 under r3 survive in every
  run; what moves is Bo1, to a sister of St2. These values were found by
  searching for them, so they show that the stemma is consistent with
  such rules, not that the rules confirm it independently.
- A likelihood model without such parameters points the same way:
  stochastic Dollo with a loss rate for each edge, compared by BIC. It
  finds the edition's unrooted tree on both matrices (no r3: +23 to +26;
  St1 as a leaf: +13.6). It cannot root the tree.
- The root comes from the asymmetry of gains and losses and from
  refinement, not from dates. Dynamic commands per bar: Wi1 4.5, r1 4.4,
  St1 7.9, r3 8.4, Ne1 8.6, St2 and Ch1 11.7. The copies' dates would
  root at St1 (1909) at a cost of +202.5. Wi1, punched later, carries the
  older text.

**Edits to versions.** On the tree, a reading is inserted at the
youngest common ancestor of the copies carrying it and deleted where a
whole subtree lacks it. That places 1357–1360 of 1428 symbols as the
edition does. Almost all of the rest is the root edge. A reading only Wi1
carries is either an addition of R1.1 or an r1 reading that R2 moved or
struck, and presence alone cannot tell which. The rule that settles it:

- a reading of the same kind lies within d mm on the other side (it was
  moved), or
- the reading is redundant, or
- it explains a redundancy (explain-redundancy).

With it, all 71 Wi1-only readings are sorted as the editor sorted them
(42 ≤ d ≤ 100 mm), and the whole edition reaches 1415/1428 insertions
and 635/655 deletions at d = 50 mm. But d decides much of that. A
same-kind neighbour turns up by chance for 20 % of readings at 20 mm, 27 %
at 30 mm and 38 % at 50 mm. The hits in excess of chance stop growing at
about 20 mm. A defensible d is 20–30 mm (1403–1409 insertions); a larger
one matches the edition by convention rather than evidence.

**Polarity.** The latch predicate is computable. A latched command (Mezzoforte,
SlowCrescendo, the pedals) is redundant when it finds its function already
in the state it sets.
- It flags all 11 deletions typed or motivated as cleanups.
- It flags all 4 insertions typed `add-redundancy`.
- It finds the 4 accents L1 withdrew by striking the On while the Off
  stayed behind.

Removing a reading and emulating again tells an effective command from
an ineffective one. The two tests disagree on Forzando: the emulator
holds it as a valve (`t100/relay.js` rejects a latch), while
`substitution.ts`, the green recoding and the edition treat it as a
latched pair.

Refinement orients every edge as a global measure. As a judgement on one
reading at a time it agrees with the editor in 88 % of cases, and only
57 % on L1, a re-cut that simplified. The score gives no polarity: no
copy has a wrong pitch, and R2's 25 corrections are crescendo moves.

## What the test turned up in the edition

- **Explain-redundancy does not hold as "never".** R4's SlowCrescendoOn
  at 8605.0 mm ("Hervorhebung des Melodietons") makes effective the
  SlowCrescendoOff at 8628.0 mm that R2 left redundant when it struck
  r1's On at 8549.9. L1's SustainPedalOff at 6795.8 mm is motivated
  "following-command-made-effective". The argument for L1 ← r1 at
  2873 mm leans on the rule in the form these two insertions break.
- **One loss the stemma does not explain.** St2, Wi1 and Ch1 carry the
  SlowCrescendoOn at 1741.8 mm (treble), and no edit deletes it, yet St1
  lacks it. Without it, R2's own Off at 1758 is redundant. The copy St1
  may have lost it.
- **Two edits of R4 are probably reader scatter.** Its two "prolong"
  edits at 2373.4 and 5032.7 mm replace r3 readings that Ne1 alone
  carries, 4.5 mm off, just outside R4's 4.08 mm window. Ne1's reader
  scatters by about 0.75 mm, with expressions 1.0 mm late.
- **The contamination is invisible in the stored symbols.** Its four
  readings are kept as an r1 symbol carried by Wi1 alone plus an L1
  symbol carried by Ne1 alone, 0.2–3.1 mm apart. The blind collation
  joins them: `..1..1` is exactly these four. So the conflict can be
  found automatically. Whether it is contamination, chance or a lost
  state, it cannot say.
- **The "45" places of the notes of R1.1 and L1** cannot be reproduced.
  The edition holds 59 Wi1-only readings of r1 that R2 strikes or moves,
  in 56 edits, which make 46–48 places depending on how pairs are
  grouped.
- **Redundancies are cleaned up under two conventions.** Two redundant
  readings of St1 and Wi1 (1770, 8037 mm) and one of St1 (9041.9 mm) are
  deleted separately in R4 and L1. A reading of the same pattern at
  7364.7 mm is deleted once, in r3.
- **Two readings carry no symbol:** St1's note across tracks 52–53 at
  5712 mm, and the MezzoforteOff half of Ch1's two-track hole at
  1145 mm.
- **A copy's later alteration counts as a version's insertion.** The
  MezzoforteOn of L2 at 1145 mm is carried by a chain Ch1 received later,
  a "technical-improvement" alteration.

## Rules the reconstruction needed beyond `rules.html`

1. *Transfer losses:* what a re-cut for another system lacks is weak
   evidence of descent (κ).
2. *Deviation of a copy:* a copy may lack a reading of the version it
   carries (cdev).
3. *Economy of lost states:* a lost state is posited only where shared
   additions require it (λ).
4. *Moved readings:* a reading on one side with one of the same kind
   within d mm on the other is one reading moved, not an addition and a
   deletion.
5. *Orientation:* refinement orients the stemma as a whole, not reading
   by reading; the dates of the copies do not orient it.
6. *Explain-redundancy* is weighed, not absolute.

## Roll Desk

The desk's code would shrink little; the work done outside it would
mostly go.

- **Desk code that becomes unnecessary:** about 285 lines of the desk's
  23,259 (AttachTo, Recollate, ToleranceFields, part of VersionMenu);
  about 540 lines change.
- **Library code that becomes unnecessary:** about 330 lines of
  `ops/collation.ts` and `ops/versions.ts`.
- **Code the engine would need:** collation of all copies, tree search,
  placement, lost states and identifiers, probably 1–2 thousand lines.
- **What would go:** the scripts that built the stemma outside the desk,
  about 2,300 lines (`enrich-edition.ts`, `add-licensee-d3.ts`,
  `revise-widuch-layer.ts`, `dissolve-b1.ts`), and the rounds of repair.

Of the structural changes in the history of `edition.jsonld`, only L1 ← r1
and r5 needed judgement. The others either came with a new witness or
undid an artefact of pairwise collation and placement by common ancestor:
- B1 (10 to 15 September) and the 52 readings of A1 (10 to 14 September);
- the tolerance going from 8 to 5 mm;
- the repairs of r3.

**Identifiers.** Computing versions anew needs stable identifiers.
`insertion()` and `deletion()` mint a new UUID at every collation, and 308
of 1714 edit IRIs ever minted are gone. The ids would have to follow from
content: a version keeps its UUID on best overlap of what it inserts and
who witnesses it, and an edit takes a UUIDv5 of its version and the
symbols it inserts and deletes.

**What the editor fixes.** The editor's decisions would be kept as fixed
inputs that a computation does not overwrite:
- a derivation under a belief the editor wrote;
- an edit with a motivation, which binds its symbols to its version;
- a version with statements, a creation or no edits;
- explicit statements that two readings are the same, or are not.

`isCollationsOwn` already makes that distinction at the level of edits.

## Files

| Directory | Content |
|---|---|
| `collation/` | the blind collation (`blind.mjs`, `blind-matrix.json`), its comparison with the edition, the order and window tests |
| `audit/` | the presence matrix of the edition's symbols (`matrix.json`), the forward check and the rule "youngest common ancestor" against the edition |
| `inference/` | parsimony over all trees (`trees.py`, `rules.py`), the likelihood model (`ml*.py`), the placement of edits (`derive*.py`), the window on the root edge |
| `polarity/` | redundancy by latch and by emulation, refinement, the score |
| `history/` | the stemma at every commit of `edition.jsonld` and the loss of IRIs |
| `literature/` | a short review of the methods, with references |

`MISSING.md` in a directory names what was left out there and how to
make it again.

## Running

Node 22 or later, and Python 3 with numpy for `inference/`. The scripts
read `../edition.jsonld` relative to themselves and run from any
directory; `WELTE225_EDITION` points them at another file.

```
npm install                                  # linked-rolls 0.71.0, welte-mignon-emulator 1.1.0
pip install -r inference/requirements.txt    # numpy
sh audit/run_all.sh                          # the presence matrix and the checks against the edition
node collation/matrix.mjs                    # the blind collation, into collation/blind-matrix.json
python3 inference/run.py                     # parsimony over all admissible trees, about 40 s
W225_REPO=/path/to/full/clone node history/history.mjs   # needs a clone with the full history
```
