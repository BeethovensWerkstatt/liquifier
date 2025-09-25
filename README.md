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
     *(This might be* `cd ../data` *if the liquifier repo is cloned
      into the BeethovensWerkstatt directory.)*
  4. Run the docker image:  
     ```bash
     docker run --rm -ti -v $(pwd)/data:/usr/src/app/data -v $(pwd)/cache:/usr/src/app/cache -v $(pwd)/.git:/usr/src/app/.git:ro -w /usr/src/app jpvoigt/liquifier node index.js
     ```

The `-v` flags mount the `data` and `cache` directories from the host machine into the
docker container, so that the liquifier can read input files and write output files.
The `.git` directory is mounted to enable accessing the versioning of the generated files.
It is mounted read-only to prevent any accidental changes to the git repository.

Newly created files are *not* committed automatically. You can check which files were
created or modified by running `git status` in the `data` directory.

### on a server


