# Fluid Animation Phases

This document defines the canonical phase model for fluid animations.

The sequence is fixed and must always be used in this order:

1. `digitalFacsimile`
2. `writingZone`
3. `finding`
4. `normalization`
5. `readingOrder`
6. `regulation`
7. `supplements`
8. `interventions`

## Phase Semantics

### 1) digitalFacsimile
- Shows facsimile image only.
- No writing-zone shapes and no transcription content are visible.

### 2) writingZone
- Shows facsimile image plus writing-zone shapes overlay.
- No transcription content is visible.

### 3) finding
- Represents manuscript-level evidence before normalization.
- Elements are positioned with DT-derived geometry where available.
– This is pure Thulemeier-rendered output.

### 4) normalization
- Represents the normalized DT state.
- Geometry reflects normalization results while retaining DT positioning.
– Changes involve beam angles and stem lengths.

### 5) readingOrder
- Applies block-level reordering only.
- No intra-block reflow should happen in this phase.
– This step is only relevant for transcriptions spanning multiple systems – here, these systems are re-arranged into one continuous system.

### 6) regulation
- Applies internal reflow and layout regulation inside each reading-order block.
- Supplied/editorial-only elements remain hidden through this phase.
– Positions of all notation components are moved to the normalized position that Verovio uses.

### 7) supplements
- Reveals supplied/editorial material.
- Used for additions that should become visible after regulation.

### 8) interventions
- Applies explicit editorial interventions and final overrides.
- Represents the final editable interpretation state.

## Implementation Rules

- The phase names above are the only valid phase names in animation state descriptors.
- Animation values should resolve to eight frames in this exact order.
- If an intermediate phase value is missing, resolvers may derive it, but they must not introduce legacy phase names.

## Current Code Anchors

- Animation asset preparation and eight-phase animation writer: `src/utils/ft/animation.js`
- Fluid-transcript composition and writing-zone visibility: `src/rendering/renderers/ftAnimation.js`
- Staff-line and reading-order system animation: `src/utils/ft/staffLines.js`
- Per-element animation of notation, one module per element type: `src/preparation/liquify/*.js`
- Interventions phase helpers: `src/utils/ft/phaseEight.js`, `src/utils/ft/regulation.js`, `src/utils/ft/choices.js`, `src/utils/ft/rhythm.js`

## The Interventions Phase in the Code

Each `liquify<Elements>` module animates its elements through all eight phases. For the interventions phase, the
elements move from the layout of the `./orig` rendering to the layout of the `./reg` rendering, and editorial
changes (e.g. a rhythm edit) become visible. Since this depends on the animations of all other elements and changes
the structure of the SVG, a module registers this part with `deferRegulation`, and `liquifyMusic` runs it once all
modules have finished.

- `regulateLayout` shifts elements to their reg position, unless an animation already does so.
- `choices.js` keeps Verovio's `choice` / `orig` / `reg` markup only where something differs, so that structural
  selectors such as `.choice > .orig` reach exactly what is edited. Elements whose only difference is their rhythm
  are unwrapped, and just the parts that differ (e.g. a flag, dots, one beam line) get a choice of their own.
- Everything that arrives in the interventions phase gets the classes `intervention suppl`, everything that
  leaves gets `intervention remove`.
- Temporary bookkeeping is kept in memory, never in attributes of the generated SVG.
