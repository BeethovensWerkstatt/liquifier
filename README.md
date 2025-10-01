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
     docker run --rm -ti -v $(pwd)/data:/usr/src/app/data -v $(pwd)/cache:/usr/src/app/cache -v $(pwd)/.git:/usr/src/app/.git:ro -w /usr/src/app liquifier node index.js
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
              run: docker run --rm -v $(pwd)/data:/usr/src/app/data -v $(pwd)/cache:/usr/src/app/cache -v $(pwd)/.git:/usr/src/app/.git:ro ghcr.io/beethovenswerkstatt/liquifier:latest node index.js

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
node index.js [-q] [--recreate] [fileNames*]
```

The liquifier script can be run with the following command line arguments:
- `-q`: quiet mode, suppresses non-essential output
- `-v`: verbose mode, log some more information (superseded by `-q`)
- `--recreate`: forces the recreation of all output files, even if they are up-to-date
- `--hours <number>`: specifies the number of hours to look back for modified files (default `24`)
- `--since <date>`: specifies a date to look back for modified files (supersedes `--hours`)
- `--full`: generates full fluid transcriptions instead of only the changes (supersedes `--hours` and `--since`)
- `--types`: comma separated list of transcription types (`at`,`dt`,`ft`  | *default all*)
- `--media`: comma separated list of files to create (`svg`,`midi`,`html` | *default all*)
- `fileNames`: any number of file names to process, separated by spaces. If not provided, the files are selected by the most recently modified ones *(work in progress)*.

Any filter options are ignored, when a list of files is given.

The dates are compared by the last commit date of any file. If the files are modified but
not yet committed, they will be recreated even if they are already up-to-date.

## Environment variables

If the environment variable `fileNames` is set, it will be used as a comma-separated list of
file names to process. This can be useful when running the script in a Docker container or
on a server where command line arguments may not be easily passed.
The command line arguments take precedence over the environment variable.
