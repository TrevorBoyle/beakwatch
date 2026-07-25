# Bird cutouts

Drop one PNG per species here, named by its **slug** — lowercase, spaces and
apostrophes stripped, spaces turned into hyphens. Examples:

| Species             | Filename                |
| -------------------- | ------------------------ |
| Red Wattlebird       | `red-wattlebird.png`     |
| New Holland Honeyeater | `new-holland-honeyeater.png` |
| Rainbow Lorikeet     | `rainbow-lorikeet.png`  |

Not sure of the exact slug? It's `commonName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-')`
— or just check what Beakwatch itself detected (BirdNET-Go's `commonName` field) and run it through that.

A transparent background works best — the Collage panel lays each tile
straight onto its own background with nothing behind the bird itself. Any
image tool works: paste a reference photo into whatever AI image generator
you like and ask it to cut the background out, or cut a photo out yourself.

Once a file is here, **it replaces the placeholder everywhere** —
sidebar, Last Identified, Species Profile, Rare Visitors, Most Popular
Species, Activity Patterns, the Collage panel, all of it — not just the
Collage. It's served as-is (no resizing), so a smaller file loads faster
everywhere it's used.

Species without a file here just show a generic question-mark placeholder
(or, in the Collage panel, are left out entirely) — nothing here is
required for the rest of Beakwatch to work, and nothing is generated
automatically.
