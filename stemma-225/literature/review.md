# Methods review: literature for an automatic, deterministic piano-roll stemma

[V] = verified online during the review. [M] = from memory. The downloaded third-party texts the review read are not included (copyright); see MISSING.md.

## 1. Formal models

- **shared-addition** is Maas's Leitfehler, which in cladistics is a synapomorphy [2].
- **"Gained once, lost many times"** is Dollo parsimony [4].
- **An r1 reading that is struck for good** is a Camin–Sokal irreversible character [3].
- **Additions that are never lost** give a directed binary perfect phylogeny: O(nm), and the minimal tree is unique [6; uniqueness M]. If an addition may be lost at most once, it is a persistent phylogeny [7].
- Roelli's Leitfehler weighting is the four-gamete compatibility test (Parvum lexicon).
- **Complexity:** finding the best Dollo or Camin–Sokal tree is NP-hard [5]. Labelling a fixed tree under Dollo takes linear time. Exact branch-and-bound (PHYLIP DOLPENNY/PENNY) returns *all* optimal trees and is "useable up to about ten species" [8].
- **Sampled ancestors** [9]: in stemmatics, extant exemplars at internal nodes are normal. Semstem allows them; RHM, PAUP*, NJ and ML do not [12].
  - The search space is the rooted Greg trees, where lost nodes have at least 2 children: 91,984 for 6 witnesses, 7.3×10^7 for 8, 1.0×10^11 for 10 [10].
  - So a lost state can only be identified where the tree branches: r3 can be recovered, r5 cannot.
- **Hyparchetypes:** ancestral-state reconstruction at internal nodes.
- **Contamination vs homoplasy:** networks (NeighborNet, split decomposition) show conflicting splits. On the Monarchia, MP and NeighborNet matched the traditional stemma and found exemplar changes [14].

## 2. Tools and evaluations

- **CASC benchmark** [11], scored by average sign similarity on artificial data sets 1–3:

  | Method | Score (%) |
  |---|---|
  | RHM | 76.0 / 79.9 / 76.9 |
  | PAUP parsimony | 74.4 / 77.8 / 74.5 |
  | NJ | 64.4 / 81.5 / 76.2 |
  | NeighborNet | 59.1 / 77.8 / 70.2 |

  No method won everywhere. On the real data set, a domain expert judged no submission "plausible and useful".
- **Semstem** reaches up to about 80% and mostly beats RHM, MP and NJ significantly. Unlike them, it can place witnesses at internal nodes [12]. Both are stochastic searches with user-set iterations.
- **Direction is never scored.** The metric uses undirected path lengths. Rooting is the weak point:
  - Hoenen's rooting methods found the true root in at most 2 of 3 traditions [16].
  - The Parvum lexicon says "an unrooted tree cannot be considered a stemma"; polarity has to come from external or internal criteria, because outgroups are rare.
- **The editor stays central:**
  - Andrews & Macé test the editor's hypotheses against the variation and find that excluding "trivial" variation is questionable [13].
  - Salemans (2000) selects variant types a priori.
  - The PCC package covers "textual or musical traditions" [15].

## 3. Music, mechanical media, direction from a domain rule

- **Music:**
  - Gibbons (16 sources) and Bach WTC II, where the groups track revisions [17].
  - Chant phylogeny (Hajič et al., ISMIR 2023) [V].
  - Tape-music copies, 90% correct or plausible [18].
- **Piano rolls:** I found no stemmatic work, only digitisation (SUPRA, ISMIR 2019) and roll-production history (Phillips 2017) [V]. As far as I can tell, WM 225 has no precedent.
- **Direction from a domain rule:** the software-lineage work [19] uses Lehman's laws ("code size usually grows"):
  - the root is the smallest and least complex version, and deletions cost twice as much as additions;
  - knowing the correct root raised accuracy from 77.8% to 91.8%.
  This is the "refinement" rule. Hoenen derives direction from asymmetric confusion probabilities [16]. Lectio difficilior/brevior are the classical equivalents.

## 4. Determinism

- Exhaustive search and branch-and-bound are deterministic and enumerate all ties. Heuristics (PAUP* heuristic search, RHM, Semstem EM) depend on the seed and the iterations.
- With few witnesses, ties are normal. Standard practice is to report all most-parsimonious trees plus a strict consensus [M].
- Editorial override: user or constraint trees (PHYLIP MOVE/DOLMOVE), or editor-supplied hypotheses (Stemmaweb).

## Implications for 6–10 witnesses

1. **Typed binary characters per collated symbol:**
   - a post-r1 addition is Dollo-up, and its loss is allowed only if it is redundant (independent-cleanup);
   - an r1 reading may be lost, but loss is irreversible;
   - unreadable stretches, Ne1 below its precision and Bo1 recoding are "?" (unknown), not 0.
2. **Compatibility test first.** If the non-redundant characters are compatible, the stemma is the containment diagram of the carrier sets. It is unique and takes O(nm).
   - Witnesses without private edits become internal nodes (St1→R2, St2→R4).
   - Sets that match no witness become lost states (r3).
   - Conflicts are listed, not hidden. I expect (not tested) that L1←r1 will appear as the 4 r1 readings in Ne1 that would need a forbidden regain.
3. **Otherwise, score every rooted Greg tree.** For 6 witnesses that is trivial; 8 is feasible; 10 needs branch-and-bound. Report all optima and the characters that discriminate between them. Break ties only by explicit, ordered rules, logged as decisions.
4. **Fix the root by polarity (refinement), and make it explicit.** It is the least reliable step in every evaluation.
5. **Assign edits to versions by Dollo labelling on the final tree:** linear time and deterministic.
6. **The real non-determinism is the collation tolerance** ("exactly the same place"). Report the stemma's sensitivity to it.

## References

1. Maas 1937, "Leitfehler und stemmatische Typen", Byzantinische Zeitschrift 37(2):289–294 [V]. Defines shared-addition.
2. Platnick & Cameron 1977, "Cladistic methods in textual, linguistic, and phylogenetic analysis", Systematic Zoology 26:380–385 [V]. Leitfehler = synapomorphy.
3. Camin & Sokal 1965, "A method for deducing branching sequences in phylogeny", Evolution 19:311–326 [V]. Irreversible characters.
4. Farris 1977, "Phylogenetic analysis under Dollo's law", Systematic Zoology 26:77–88 [V]. The Dollo model.
5. Day, Johnson & Sankoff 1986, "The computational complexity of inferring rooted phylogenies by parsimony", Mathematical Biosciences 81:33–42 [V via citation, Dai et al. 2024]. NP-hardness.
6. Gusfield 1991, "Efficient algorithms for inferring evolutionary trees", Networks 21:19–28 [V]. Perfect phylogeny.
7. Bonizzoni, Braghin, Dondi & Trucco 2012, "The binary perfect phylogeny with persistent characters", Theoretical Computer Science 454:51–63, doi:10.1016/j.tcs.2012.05.035 [V].
8. Hendy & Penny 1982, Mathematical Biosciences 59:277–290 [V]; PHYLIP DOLPENNY documentation, csbf.stanford.edu/phylip/dolpenny.html [V]. Exact search; returns all optima.
9. Gavryushkina, Welch, Stadler & Drummond 2014, "Bayesian inference of sampled ancestor trees…", PLoS Computational Biology 10(12):e1003919 [V].
10. Flight 1990, "How many stemmata?", Manuscripta 34:122–128; OEIS A005264 [V]. Size of the search space.
11. Roos & Heikkilä 2009, "Evaluating methods for computer-assisted stemmatology using artificial benchmark data sets", Literary and Linguistic Computing 24(4):417–433 [V]. Scores from cs.helsinki.fi/u/ttonteri/casc/results.html [V].
12. Roos & Zou 2011, "Analysis of textual variation by latent tree structures", ICDM 2011:567–576 [V, read].
13. Andrews & Macé 2013, "Beyond the tree of texts…", Literary and Linguistic Computing 28(4):504–521, doi:10.1093/llc/fqt032 [V].
14. Windram, Shaw, Robinson & Howe 2008, Dante's Monarchia as a test case for phylogenetic methods, Literary and Linguistic Computing 23(4):443–463 [V].
15. Camps & Cafiero 2015, doi:10.1484/M.LECTIO-EB.5.102565; CRAN package stemmatology 0.3.2 [V].
16. Hoenen 2019, "Rooting through Direction", DHd 2019 [V]; Hoenen, Eger & Gehrke 2017, doi:10.18653/v1/W17-3402 [V].
17. Windram, Charlston & Howe 2014, Early Music 42(4):515–528 [V]; Windram, Charlston, Tomita & Howe 2022, Early Music 50(3):373–393, doi:10.1093/em/caac027 [V].
18. Verde, Pretto, Milani & Canazza 2018, "Stay true to the sound of history…", Applied Sciences 8(2):226, doi:10.3390/app8020226 [V].
19. Jang, Woo & Brumley 2013, "Towards automatic software lineage inference", USENIX Security:81–96 [V, read].
20. Background:
    - [V] Trovato 2014/2017, *Everything You Always Wanted to Know about Lachmann's Method* (Padova).
    - [V] Roelli (ed.) 2020, *Handbook of Stemmatology*, doi:10.1515/9783110684384.
    - [V] Parvum lexicon stemmatologicum (wiki.helsinki.fi).
    - [V] Bryant & Moulton 2004, Molecular Biology and Evolution 21:255–265 (NeighborNet).
    - [M] Bandelt & Dress 1992 (split decomposition).
