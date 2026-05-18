# liquifier
This repo holds code that can be used to generate fluid transcriptions.

## Installation
### locally

To run and test the liquifier locally, follow these steps:

  1. Clone the repo and navigate into it:  
     ```bash
     git clone git@github.com:BeethovensWerkstatt/liquifier.git
     cd liquifier
     ```
  2. create the docker image:  
     ```bash
     docker build -t liquifier:latest .
     ```
  3. Move to the `BeethovensWerkstatt/data` directory:  
     ```bash
     cd <path/to/BeethovensWerkstatt/data>
     ```
     *(This might be* `cd ../data` *if the `liquifier` repo is cloned next to `data`.)*
  4. Run the docker image:  
     ```bash
     docker run --rm -ti -v $(pwd)/data:/usr/src/app/data -v $(pwd)/cache:/usr/src/app/cache -v $(pwd)/.git:/usr/src/app/.git:ro -w /usr/src/app liquifier node index.js --input-dir=/usr/src/app/data/sources --output-dir=/usr/src/app/cache
     ```

The `-v` flags mount the `data` and `cache` directories from the host machine into the
docker container, so that the liquifier can read input files and write output files.
The `.git` directory is mounted to enable accessing the versioning of the generated files.
It is mounted read-only to prevent any accidental changes to the git repository.

Newly created files are **not** committed automatically. You can check which files were
created or modified by running `git status` in the `data` directory.

### on a server

The liquifier can also be run as a GitHub Action on a server. To set this up, follow these steps:

  1. Fork the [BeethovensWerkstatt/data]
  2. In your fork, go to the "Actions" tab and enable GitHub Actions if it is not already enabled.
  3. Create a new workflow file in the `.github/workflows` directory of your fork. You can name the file `liquifier.yml`.
  4. Add the following content to the `liquifier.yml` file:
    ```yaml
      name: Liquifier | Generate and cache diplomatic, annotated, and fluid transcriptions
      on:
        push:
          branches:
            - main
          paths:
            - 'data/sources/**/annotatedTranscripts/**/*.xml'
            - 'data/sources/**/diplomaticTranscripts/**/*.xml'
      jobs:
        build:
          name: Generate Cache files
          runs-on: ubuntu-latest
          permissions:
            contents: write

          steps:
            - name: Checkout repository
              uses: actions/checkout@d632683dd7b4114ad314bca15554477dd762a938 # v4.2.0

            - name: ensure cache
              run: mkdir -p cache

            - name: run Docker image
              run: docker run --rm -v $(pwd)/data:/usr/src/app/data -v $(pwd)/cache:/usr/src/app/cache -v $(pwd)/.git:/usr/src/app/.git:ro ghcr.io/beethovenswerkstatt/liquifier:latest node index.js --input-dir=/usr/src/app/data/sources --output-dir=/usr/src/app/cache --context-document=Notirungsbuch_K

            # check repo status before push to avoid overlapping commits

            - name: configure git
              run: |
                echo "Configuring git..."
                git config user.name "github-actions"
                git config user.email "github-actions@users.noreply.github.com"
            
            - name: Commit
              run: |
                git add .
                git commit -m "generate and cache transcriptions for @${{ github.sha }}"
                git push
    ```
  5. Commit and push the `liquifier.yml` file to your fork.
  6. The workflow will run automatically whenever there is a push to the `main` branch that
  affects files in the `data/sources/**/annotatedTranscripts/` or `data/sources/**/diplomaticTranscripts/` directories.

Make sure to monitor the Actions tab in your fork to see the status of the workflow runs.

The GitHub action is responsible for committing the newly created or modified files back
to the repository. It is configured to use a generic "github-actions" user for the commits.
The liquifier node application will not make any commits itself!

## Command line arguments

```bash
node index.js [-q] [--recreate] [--input-dir <path>] [--output-dir <path>] [--context-document <id-or-path>] [fileNames*]
```

The liquifier script can be run with the following command line arguments:
- `-q`: quiet mode, suppresses non-essential output
- `-v`: verbose mode, log some more information (superseded by `-q`)
- `--recreate`: forces the recreation of all output files, even if they are up-to-date
- `--hours <number>`: specifies the number of hours to look back for modified files (default `24`)
- `--since <date>`: specifies a date to look back for modified files (supersedes `--hours`)
- `--full`: generates full fluid transcriptions instead of only the changes (supersedes `--hours` and `--since`)
- `--types`: comma separated list of transcription types (`at`,`dt`,`ft`,`editedAt`,`fluidSystems` | *default all*)
  - compatibility note: legacy `eat` is accepted and normalized to `editedAt`
- `--media`: comma separated list of files to create (`svg`,`midi`,`html` | *default all*)
- `--input-dir` (or `-i`): specifies the base directory for input files (default `./`)
- `--output-dir` (or `-o`): specifies the base directory for output files (default `./cache`)
- `--context-document`: optional context document identifier or path (for example `Notirungsbuch_K`). When set, it is loaded once and provided as `data.reconstructionDom` during processing.
- `fileNames`: any number of file names to process, separated by spaces. If not provided, the files are selected by the most recently modified ones *(work in progress)*.

### Directory Configuration

The `--input-dir` and `--output-dir` parameters allow you to configure where the liquifier reads input files from and writes output files to. This is particularly useful for different deployment scenarios:

**Local development example:**
```bash
# Read from data repository, write to data repository's cache
node index.js --input-dir=../data/data/sources --output-dir=../data/cache diplomaticTranscripts/filename.xml
```

```bash
# Local test of one specific transcription
node index.js --types=editedAt,fluidSystems --recreate=true --input-dir=../data/data/sources --output-dir=../data/cache --context-document=Notirungsbuch_K D-BNba_MH_60_Engelmann/diplomaticTranscripts/D-BNba_MH_60_Engelmann_p005_wz06_dt.xml
```

**Docker container example:**
```bash
# When running in Docker with mounted volumes
docker run --rm -v $(pwd)/data:/usr/src/app/data -v $(pwd)/cache:/usr/src/app/cache liquifier \
  node index.js --input-dir=/usr/src/app/data/sources --output-dir=/usr/src/app/cache --context-document=Notirungsbuch_K
```

When using these parameters, file paths in the `fileNames` argument should be relative to the `--input-dir`. Output files will maintain the same directory structure within the `--output-dir`.

### Context Document Configuration

If your rendering path relies on reconstruction data, pass `--context-document`.

The value can be either:
- a short identifier such as `Notirungsbuch_K`
- or a direct path to the XML file

With `--input-dir=../data/data/sources`, the short identifier `Notirungsbuch_K` resolves to:
- `../data/data/sources/Notirungsbuch_K/Notirungsbuch_K.xml`
- `../data/data/sources/sources/Notirungsbuch_K/Notirungsbuch_K.xml`
- `/data/sources/Notirungsbuch_K/Notirungsbuch_K.xml`

Example command:

```bash
node index.js --types=editedAt,fluidSystems --recreate=true --input-dir=../data/data/sources --output-dir=../data/cache --context-document=Notirungsbuch_K D-BNba_MH_60_Engelmann/diplomaticTranscripts/D-BNba_MH_60_Engelmann_p017_wz01_dt.xml
```

Any filter options are ignored, when a list of files is given.

The dates are compared by the last commit date of any file. If the files are modified but
not yet committed, they will be recreated even if they are already up-to-date.

## Output Structure

The liquifier generates multiple output files organized in a page-based folder hierarchy. This organization ensures manageable folder sizes (typically ~20 files per page) and enables efficient API access patterns.

### Folder Organization

All output files are organized into page-based folders using the pattern `{type}/{page}/`:

```
cache/sources/D-BNba_MH_60_Engelmann/
├── annotatedTranscripts/
│   └── p005/
│       ├── D-BNba_MH_60_Engelmann_p005_wz06_at.svg
│       ├── D-BNba_MH_60_Engelmann_p005_wz07_at.svg
│       └── ...
├── annotatedMidi/
│   └── p005/
│       ├── D-BNba_MH_60_Engelmann_p005_wz06_at.mid
│       └── ...
├── diplomaticTranscripts/
│   └── p005/
│       ├── D-BNba_MH_60_Engelmann_p005_wz06_dt.svg
│       ├── D-BNba_MH_60_Engelmann_p005_wz06_syss289fb17d-10e3-4b27-9b64-8d2d6a560c1d_dt.svg
│       ├── D-BNba_MH_60_Engelmann_p005_wz06_sys{anotherSystemId}_dt.svg
│       └── ...
├── fluidTranscripts/
│   └── p005/
│       └── D-BNba_MH_60_Engelmann_p005_wz06_ft.svg
├── fluidSystems/
│   └── p005/
│       └── D-BNba_MH_60_Engelmann_p005_wz06_fs.svg
├── editedAT/
│   └── p005/
│       └── D-BNba_MH_60_Engelmann_p005_wz06_eat.xml
└── fluidHTML/
    └── p005/
        └── D-BNba_MH_60_Engelmann_p005_wz06_ft.html
```

**Page folder naming:**
- Extracted from input filename using pattern `_p(\d{3})_`
- Always three-digit page numbers: `p005`, `p042`, `p123`, etc.
- Applied to all output types: AT, DT, FT, Edited AT, MIDI, HTML

### Diplomatic Transcript System Files

For each diplomatic transcript, the liquifier generates **multiple output files**:

1. **Full diplomatic transcript**: Contains all systems from the writing zone
   - Filename: `{source}_{page}_{wz}_dt.svg`
   - Example: `D-BNba_MH_60_Engelmann_p005_wz06_dt.svg`
   - Renders the complete diplomatic transcript with all systems and their rastrums

2. **Individual system files**: One file per system in the diplomatic transcript
   - Filename: `{source}_{page}_{wz}_sys{systemId}_dt.svg`
   - Example: `D-BNba_MH_60_Engelmann_p005_wz06_syss289fb17d-10e3-4b27-9b64-8d2d6a560c1d_dt.svg`
   - Each file contains only one system with its associated rastrums (staff lines)
   - Optimized for file size by including only the rastrums used by that specific system
   - Enables assembly into "virtual continuous staves" across multiple pages

**System file characteristics:**
- System IDs are taken from the MEI document's `<system xml:id="...">` or `<bw:system xml:id="...">` elements
- Each system file is standalone and can be loaded independently
- Rastrums (staff lines) are filtered to include only those used by that specific system
- All system files use the same coordinate system as the full DT for consistent positioning

**Use cases:**
- **Full DT files**: Display complete diplomatic transcripts in context
- **Individual system files**: Assemble continuous notation across page boundaries, create excerpt views, or display systems independently in a web application

**Metadata and ordering:**
- No separate JSON metadata files are generated (all metadata remains in source MEI)
- System ordering can be reconstructed from annotated transcripts
- API implementations can retrieve file lists and construct ordering from MEI source data

### File Naming Patterns

All output files follow consistent naming conventions:

| Type | Pattern | Example |
|------|---------|---------|
| Annotated Transcript | `{source}_{page}_{wz}_at.svg` | `D-BNba_MH_60_Engelmann_p005_wz06_at.svg` |
| Annotated MIDI | `{source}_{page}_{wz}_at.mid` | `D-BNba_MH_60_Engelmann_p005_wz06_at.mid` |
| Diplomatic Transcript (Full) | `{source}_{page}_{wz}_dt.svg` | `D-BNba_MH_60_Engelmann_p005_wz06_dt.svg` |
| Diplomatic System | `{source}_{page}_{wz}_sys{systemId}_dt.svg` | `D-BNba_MH_60_Engelmann_p005_wz06_syss289fb17d-10e3-4b27-9b64-8d2d6a560c1d_dt.svg` |
| Fluid Transcript | `{source}_{page}_{wz}_ft.svg` | `D-BNba_MH_60_Engelmann_p005_wz06_ft.svg` |
| Fluid Systems | `{source}_{page}_{wz}_fs.svg` | `D-BNba_MH_60_Engelmann_p005_wz06_fs.svg` |
| Edited AT (MEI) | `{source}_{page}_{wz}_eat.xml` | `D-BNba_MH_60_Engelmann_p005_wz06_eat.xml` |
| Fluid HTML | `{source}_{page}_{wz}_ft.html` | `D-BNba_MH_60_Engelmann_p005_wz06_ft.html` |

Where:
- `{source}`: Source manuscript identifier (e.g., `D-BNba_MH_60_Engelmann`)
- `{page}`: Three-digit page number (e.g., `p005`)
- `{wz}`: Writing zone identifier (e.g., `wz06`)
- `{systemId}`: MEI system element ID (e.g., `s289fb17d-10e3-4b27-9b64-8d2d6a560c1d`)

### Fluid Animation Phases

Fluid animation output uses one canonical six-phase sequence:

1. `finding`
2. `normalization`
3. `readingOrder`
4. `regulation`
5. `supplements`
6. `interventions`

Detailed semantics and implementation rules are documented in [docs/fluid-animation-phases.md](docs/fluid-animation-phases.md).

### Edited Annotated Transcript Semantics

When `editedAt` output is enabled, one additional MEI file is created for every input annotated transcript:

- Output folder: `editedAT/{page}/`
- Filename suffix: `_eat.xml` (short filename suffix only; internal type key is `editedAt`)

Current wrapping behavior for Edited AT generation:

- Only elements inside the `<music>` subtree are considered.
- Only elements from this allow-list are considered:
  - `note`, `chord`, `syl`, `rest`, `mRest`, `beam`, `beamSpan`, `artic`, `accid`, `clef`, `slur`, `tie`, `curve`, `dynam`, `dir`, `keyAccid`, `meterSig`, `barLine`, `dot`, `hairpin`, `trill`, `tempo`, `pedal`, `fing`, `fermata`, `octave`
- Candidate elements must have `xml:id`.
- If no diplomatic correspondence is present (no `@corresp` token pointing to `diplomaticTranscripts` / `_dt.xml`), the element is wrapped as:
  - `<supplied resp="#bw">...</supplied>`

## Environment variables

If the environment variable `fileNames` is set, it will be used as a comma-separated list of
file names to process. This can be useful when running the script in a Docker container or
on a server where command line arguments may not be easily passed.
The command line arguments take precedence over the environment variable.

## Code Structure

The liquifier application follows a modular architecture with clear separation of concerns. The codebase is organized into logical directories that reflect the application's execution flow:

### Entry Point

**`index.js`** - Main orchestrator that coordinates the high-level application flow:
1. Parse CLI arguments
2. Initialize logger
3. Initialize tools (Verovio, Thulemeier)
4. Process files

### Source Directory Structure

```
src/
├── config.mjs                         # Global configuration
│
├── core/                              # Application orchestration
│   ├── cli.js                         # CLI argument parsing
│   ├── logger.js                      # Logging utility
│   ├── init.js                        # Tool initialization
│   └── processor.js                   # File processing orchestration
│
├── rendering/                         # Rendering engines & orchestration
│   ├── renderers.js                   # Rendering decisions (what/when to render)
│   ├── verovioHandler.js             # Verovio rendering engine interface
│   └── thulemeierHandler.js          # Thulemeier rendering engine interface
│
├── preparation/                       # Data preparation for rendering
│   ├── annotatedTranscripts.js       # Annotated transcript preparation
│   ├── editedAnnotatedTranscripts.js # Edited annotated transcript preparation
│   ├── diplomaticTranscripts.js      # Diplomatic transcript preparation
│   ├── fluidTranscripts.js           # Fluid transcript preparation
│   └── mei.js                         # MEI XML manipulation utilities
│
├── filehandlers/                      # File I/O operations
│   └── filehandler.js                 # File reading, writing, triple management
│
└── utils/                             # Generic utility functions
    ├── geometry.js                    # Vector & geometric calculations
    ├── utils.js                       # General utility functions
    ├── trigonometry.js                # Trigonometric calculations
    ├── facsimileHelpers.js           # Facsimile-specific helpers
    └── uuid.js                        # UUID generation
```

### Module Descriptions

#### Core Modules
- **cli.js**: Parses command-line arguments using minimist and returns a normalized configuration object
- **logger.js**: Provides a configurable logger with support for quiet and verbose modes
- **init.js**: Initializes Verovio and Thulemeier rendering engines
- **processor.js**: Orchestrates the processing of multiple files, handling data fetching and rendering coordination

#### Rendering Modules
- **renderers.js**: Contains specialized rendering functions for each output type (AT SVG, AT MIDI, DT SVG, FT SVG, FT HTML) with date-based rendering decisions
- **verovioHandler.js**: Wrapper for the Verovio rendering engine, handles MEI-to-SVG and MEI-to-MIDI conversion
- **thulemeierHandler.js**: Integration layer for the Thulemeier rendering library

#### Preparation Modules
- **annotatedTranscripts.js**: Prepares annotated transcript DOM structures for rendering
- **diplomaticTranscripts.js**: Prepares diplomatic transcript data structures
- **fluidTranscripts.js**: Generates fluid transcription animations and transitions
- **mei.js**: Core MEI XML manipulation functions used across transcript types

#### File Handling
- **filehandler.js**: Manages file I/O operations, creates file triples (input/output path mappings), fetches data from multiple sources, and writes rendered output

#### Utilities
- **geometry.js**: Vector mathematics and geometric calculations (formerly `index.js`)
- **utils.js**: General-purpose utility functions (DOM manipulation, bounding boxes, etc.)
- **trigonometry.js**: Mathematical functions for rotations and transformations
- **facsimileHelpers.js**: Helper functions for working with facsimile measurements and OpenSeadragon
- **uuid.js**: UUID generation for MEI elements

### Design Principles

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Modularity**: Functions are organized by their role in the application flow
3. **Testability**: Each module can be tested independently with clear input/output contracts
4. **Maintainability**: Related functionality is grouped together, making it easy to locate and modify code
5. **Extensibility**: New rendering types or transcript formats can be added by following established patterns
