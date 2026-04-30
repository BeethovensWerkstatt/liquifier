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

- Canonical sequence constant: `src/rendering/renderers.js` (`FLUID_SYSTEMS_STATE_SEQUENCE`)
- Animation resolvers and setters: `src/preparation/fluidTranscripts.js`
