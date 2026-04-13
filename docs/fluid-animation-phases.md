# Fluid Animation Phases

This document defines the canonical phase model for fluid animations.

The sequence is fixed and must always be used in this order:

1. `finding`
2. `normalization`
3. `readingOrder`
4. `regulation`
5. `supplements`
6. `interventions`

## Phase Semantics

### 1) finding
- Represents manuscript-level evidence before normalization.
- Elements are positioned with DT-derived geometry where available.
– This is pure Thulemeier-rendered output.

### 2) normalization
- Represents the normalized DT state.
- Geometry reflects normalization results while retaining DT positioning.
– Changes involve beam angles and stem lengths.

### 3) readingOrder
- Applies block-level reordering only.
- No intra-block reflow should happen in this phase.
– This step is only relevant for transcriptions spanning multiple systems – here, these systems are re-arranged into one continuous system.

### 4) regulation
- Applies internal reflow and layout regulation inside each reading-order block.
- Supplied/editorial-only elements remain hidden through this phase.
– Positions of all notation components are moved to the normalized position that Verovio uses.

### 5) supplements
- Reveals supplied/editorial material.
- Used for additions that should become visible after regulation.

### 6) interventions
- Applies explicit editorial interventions and final overrides.
- Represents the final editable interpretation state.

## Implementation Rules

- The phase names above are the only valid phase names in animation state descriptors.
- Animation values should resolve to six frames in this exact order.
- If an intermediate phase value is missing, resolvers may derive it, but they must not introduce legacy phase names.

## Current Code Anchors

- Canonical sequence constant: `src/rendering/renderers.js` (`FLUID_SYSTEMS_STATE_SEQUENCE`)
- Animation resolvers and setters: `src/preparation/fluidTranscripts.js`
