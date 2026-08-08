# Phase 8 Todo

Phase 8 (`interventions`) now uses regulation geometry for notes and chords,
stems and flags, beams, ledger lines, slurs/ties/curves, hairpins, and octave
extenders. Independent elements are positioned through `regulationLayout.js`.

## Remaining Audit

- Audit tremolos against the regulation SVG. Their polygons may require new
  Phase 8 geometry rather than a shared translation.
- Audit barlines where regulation changes height, width, or position. Replace
  the final path geometry when a positional wrapper cannot preserve both ends.
- Audit remaining line and polygon control events for multi-anchor changes.
- Regenerate representative writing zones containing each audited class and
  compare the final FT animation value with the regulation SVG geometry.
- Add a focused regression for every class whose regulation geometry differs.

## Deliberate Limitation

Phase 8 does not clone and swap the complete regulation score. That approach
was removed because the detached regulation SVG was not visibly rendered.
The implementation instead reconciles individual regulation geometry in the
animated AT SVG.