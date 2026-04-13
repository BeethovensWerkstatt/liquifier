import fs from 'fs'
import path from 'path'
import { readFile } from 'node:fs/promises'
import { execSync } from 'child_process'
import { diplomaticRegex, verovioPixelDensity } from '../config.mjs'
import { getOuterBoundingRect } from '../utils/utils.js'
// import { get } from 'http'
// import { DOMParser } from 'xmldom-qsa'
import { JSDOM } from 'jsdom'
const { DOMParser } = new JSDOM().window

/**
 * Extract page number from filename (e.g., "_p005_" -> "p005")
 * @param {string} filename - Filename containing page pattern
 * @returns {string|null} Page identifier (e.g., "p005") or null if not found
 */
function extractPageFromFilename (filename) {
  const match = filename.match(/_p(\d{3})_/)
  return match ? `p${match[1]}` : null
}

/**
 * Insert page folder into output path
 * @param {string} outputPath - Base output path
 * @param {string} page - Page identifier (e.g., "p005")
 * @returns {string} Path with page folder inserted
 */
function insertPageFolder (outputPath, page) {
  if (!page) return outputPath

  // Split path into directory and filename
  const dir = path.dirname(outputPath)
  const file = path.basename(outputPath)

  // Insert page folder before filename
  return path.join(dir, page, file)
}

function resolveAtSymlinkTarget (symlinkPath) {
  try {
    if (!fs.existsSync(symlinkPath)) return null

    const xml = fs.readFileSync(symlinkPath, 'utf8')
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const relation = doc.querySelector('relation[rel="symlink"]')
    const target = relation?.getAttribute('target')
    if (!target) return null

    const resolved = path.resolve(path.dirname(symlinkPath), target)
    return fs.existsSync(resolved) ? resolved : null
  } catch {
    return null
  }
}

/**
 * collect files from <code>git show --name-only --pretty="format:--- %H %cI" <i>COMMIT</></code>
 * @param {string[]} lines
 * @returns {string[]} list of file paths
 */
const collectFiles = (lines) => {
  let hash = ''; let date = new Date()
  const files = {}
  for (const line of lines) {
    if (line.startsWith('---')) {
      const com = line.split(' ')
      hash = com[1]
      date = new Date(com[2])
    } else if (line) {
      files[line] = { date, hash }
    }
  }
  return files
}

/**
 * return changed files in
 * @param {string|'HEAD'} commit
 * @returns
 */
export const changedFiles = (commit = 'HEAD') => {
  const cmd = `git show --name-only --pretty="format:--- %H %cI" ${commit}`
  // console.log(cmd)
  const lines = execSync(cmd).toString().split('\n').filter(f => !!f.trim())
  return collectFiles(lines)
}

/**
 * return changed files since date
 * @param {datetime} sinceDate
 * @returns
 */
export const changedFilesSince = (sinceDate) => {
  const cmd = `git log --name-only --since="${sinceDate.toISOString()}" --pretty="format:--- %H %cI"`
  // console.log(cmd)
  const lines = execSync(cmd).toString().split('\n').filter(f => !!f.trim())
  return collectFiles(lines)
}

/**
 * return datetime of last commit for file
 * @param {datetime} file
 * @returns
 */
export const gitFileDate = (file) => {
  let date = 0
  try {
    date = execSync(
            `git log -n 1 --pretty=format:%cI -- "${file}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] } // Suppress stderr
    ) || 0
    // console.log(`${file}: ${date}`)
  } catch (e) {
    try {
      const stats = fs.statSync(file)
      date = stats.mtime
    } catch (e) {
      date = 0 // console.error(e)
    }
  }
  return new Date(date)
}

/**
* Walk through the directory and return all files
* @param {*} dir
* @param {*} regex
* @param {*} done
*/
export async function walk (dir, done, inputDir = './', outputDir = './cache') {
  let results = []

  fs.readdir(dir, function (err, list) {
    if (err) return done(err)

    let pending = list.length
    if (!pending) return done(null, results)

    list.forEach(function (file) {
      // console.log('examining file: ', file)
      file = path.join(dir, file)

      // Check if its a folder
      fs.stat(file, function (err, stat) {
        if (err) {
          console.error('Error reading file:', file, err)
          if (!--pending) { done(null, results) }
          return
        }
        if (stat && stat.isDirectory()) {
          // If it is, walk again
          walk(file, function (err, res) {
            if (err) {
              console.error('Error walking directory:', file, err)
            } else {
              results = results.concat(res)
            }

            if (!--pending) { done(null, results) }
          }, inputDir, outputDir)
        } else {
          if (file.match(diplomaticRegex)) {
            const obj = getFilesObject(file, inputDir, outputDir)

            if (obj) {
              results.push(obj)
            }
          }

          if (!--pending) { done(null, results) }
        }
      })
    })
  })
}

/**
 * given either the path of a diplomatic transcript, return the paths to all three relevant files
 * @param {*} path
 */
export function getFilesObject (file, inputDir = './', outputDir = './cache') {
  // Determine if file path is absolute or already includes inputDir
  // Check if file exists as-is (full path scenario)
  let dtFile = file
  let dtFileExists = fs.existsSync(file)

  // If not, try joining with inputDir
  if (!dtFileExists) {
    dtFile = path.join(inputDir, file)
    dtFileExists = fs.existsSync(dtFile)
  }

  // Extract just the relative path portion for output paths
  // Find the sources/... part of the path
  const sourcesMatch = dtFile.match(/(sources\/.+)/)
  const relativeFile = sourcesMatch ? sourcesMatch[1] : file

  // file is a diplomatic transcript, now check for other types
  const atFile = relativeFile.replace('diplomaticTranscripts', 'annotatedTranscripts').replace('_dt.xml', '_at.xml')
  const atFileCandidateFull = dtFile.replace('diplomaticTranscripts', 'annotatedTranscripts').replace('_dt.xml', '_at.xml')
  const atSymlinkCandidateFull = dtFile.replace('diplomaticTranscripts', 'annotatedTranscripts').replace('_dt.xml', '_symlink.xml')
  const resolvedAtFromSymlink = resolveAtSymlinkTarget(atSymlinkCandidateFull)
  const atFileFull = fs.existsSync(atFileCandidateFull) ? atFileCandidateFull : resolvedAtFromSymlink
  const atFileExists = !!atFileFull

  const regex = /_p\d+_wz\d+_dt/
  const sourceFile = relativeFile.replace('/diplomaticTranscripts/', '/').replace(regex, '')
  const sourceFileFull = dtFile.replace('/diplomaticTranscripts/', '/').replace(regex, '')
  const sourceFileExists = fs.existsSync(sourceFileFull)

  // Debug: Log which files are missing
  if (!dtFileExists || !atFileExists || !sourceFileExists) {
    console.warn(`[getFilesObject] Missing files for: ${file}`)
    if (!dtFileExists) console.warn(`  - DT file not found: ${dtFile}`)
    if (!atFileExists) {
      console.warn(`  - AT file not found: ${atFileCandidateFull}`)
      if (fs.existsSync(atSymlinkCandidateFull)) {
        console.warn(`  - AT symlink exists but target is missing/invalid: ${atSymlinkCandidateFull}`)
      }
    }
    if (!sourceFileExists) console.warn(`  - Source file not found: ${sourceFileFull}`)
    return undefined
  }

  if (dtFileExists && atFileExists && sourceFileExists) {
    // Store full paths for reading
    const dtFullPath = dtFile
    const atFullPath = atFileFull
    const sourceFullPath = sourceFileFull

    // Extract page number for folder organization
    const page = extractPageFromFilename(relativeFile)

    return {
      dt: relativeFile,
      dtFullPath,
      page,
      get dtDate () {
        return gitFileDate(dtFullPath)
      },
      get dtSvgPath () {
        const basePath = path.join(outputDir, this.dt.replace('.xml', '.svg'))
        return insertPageFolder(basePath, this.page)
      },
      get dtSvgDate () {
        return gitFileDate(this.dtSvgPath)
      },
      at: atFile,
      atFullPath,
      get atDate () {
        return gitFileDate(atFullPath)
      },
      get atSvgPath () {
        const basePath = path.join(outputDir, this.at.replace('.xml', '.svg'))
        return insertPageFolder(basePath, this.page)
      },
      get atSvgDate () {
        return gitFileDate(this.atSvgPath)
      },
      get atMidPath () {
        const basePath = path.join(outputDir, this.at.replace('.xml', '.mid').replace('/annotatedTranscripts/', '/annotatedMidi/'))
        return insertPageFolder(basePath, this.page)
      },
      get atMidDate () {
        return gitFileDate(this.atMidPath)
      },
      get editedAtPath () {
        const basePath = path
          .join(outputDir, this.at.replace('_at.xml', '_eat.xml').replace('/annotatedTranscripts/', '/editedAT/'))
        return insertPageFolder(basePath, this.page)
      },
      get editedAtDate () {
        return gitFileDate(this.editedAtPath)
      },
      get ftSvgPath () {
        const basePath = path.join(outputDir, this.at.replace('_at.xml', '_ft.svg').replace('/annotatedTranscripts/', '/fluidTranscripts/'))
        return insertPageFolder(basePath, this.page)
      },
      get ftSvgDate () {
        return gitFileDate(this.ftSvgPath)
      },
      get fsSvgPath () {
        const basePath = path.join(outputDir, this.at.replace('_at.xml', '_fs.svg').replace('/annotatedTranscripts/', '/fluidSystems/'))
        return insertPageFolder(basePath, this.page)
      },
      get fsSvgDate () {
        return gitFileDate(this.fsSvgPath)
      },
      get ftHtmlPath () {
        const basePath = this.ftSvgPath.replace('.svg', '.html').replace('/fluidTranscripts/', '/fluidHTML/')
        return basePath // Already has page folder from ftSvgPath
      },
      get ftHtmlDate () {
        return gitFileDate(this.ftHtmlPath)
      },
      source: sourceFile,
      sourceFullPath,
      get sourceDate () {
        return gitFileDate(sourceFullPath)
      }
    }
  }
  return undefined
}

export async function fetchData (triple, verbose = false, inputDir = './') {
  // Use full paths if available, otherwise join with inputDir
  const sourcePath = triple.sourceFullPath || path.join(inputDir, triple.source)
  const dtPath = triple.dtFullPath || path.join(inputDir, triple.dt)
  const atPath = triple.atFullPath || path.join(inputDir, triple.at)

  const parser = new DOMParser()

  if (verbose) {
    console.log('sourcePath: ' + sourcePath)
  }

  try {
    const responses = await Promise.all([
      readFile(sourcePath, { encoding: 'utf8' }),
      readFile(dtPath, { encoding: 'utf8' }),
      readFile(atPath, { encoding: 'utf8' })
    ])
    const source = responses[0]
    const dt = responses[1]
    const at = responses[2]

    return {
      sourceDom: parser.parseFromString(source, 'text/xml'),
      dtDom: parser.parseFromString(dt, 'text/xml'),
      atDom: parser.parseFromString(at, 'text/xml')
    }
  } catch (err) {
    console.warn('Error in fetchData: ' + err, err)
  }
}

export function writeData (content, filePath) {
  return fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    .then(x => fs.promises.writeFile(filePath, content))
}

export function generateHtmlWrapper (svg, meiSourceDom, meiDtDom, meiAtDom, path) {
  const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head>
    <title>Liquified Transcription</title>
    <style>
        body {
            margin: 0;
        }
        .content {
            margin: 2rem auto;
            position: relative;
        }
        #facsimile {
            width: 1208px;
            height: 500px;
            position: absolute;
            top: 0;
            left: 0;
            overflow: hidden;
        }
        #facsimile img {
            position: relative;
            top: -333px;
        }

        #transcription {
            width: 1008px;
            position: absolute;
            top: 202px;
            left: 0;
        }
        #controls {
            margin: 2rem auto;
            position: absolute;
            top: 450px;
            left: 400px;
        }
        #controls input {
            width: 400px;
            display: block;
        }
        #controls .label {
            display: block;
            text-align: center;
            width: 400px;
            padding: .3rem;
            font-family: 'Helvetica Neue', 'Arial', sans-serif;
            font-weight: 400;
        }
    </style>
</head>
<body>
    <div class="content">
        <div id="facsimile">
            <img src="https://edirom-images.beethovens-werkstatt.de/Scaler/IIIF/D-BNba_HCB_Mh_60%2FHCB_Mh_60_24.jpg/full/1170,/0/default.jpg" alt="Facsimile"/>
        </div>
        <div id="transcription">
            
        </div>
    </div>
    <div id="controls">
        <input type="range" min="0" max="9.99" step="any" oninput="setPos(event)" onchange="setPos(event)"/>
        <div class="label"></div>
    </div>
    <script type="text/ecmascript">
        function setPos(event) {
            const val = event.target.value / 2
            document.querySelectorAll('svg').forEach(function(svg) {svg.setCurrentTime(val)})
            const facs = document.getElementById('facsimile')
            const opacity = 1 / 3.25 * val
            facs.style.opacity = 1 - opacity
        }
        document.querySelectorAll('svg').forEach(function(svg) {svg.pauseAnimations(); svg.setCurrentTime(0);})
    </script>
</body>
</html>
`)
  const file = dom.window.document
  // svg.querySelector('foreignObject').remove()
  file.querySelector('#transcription').append(svg.querySelector('svg'))
  const label = path.replace('_ft.html', '').split('_').join(' ').replace(/ p(\d+)/g, ', page $1').replace(/ wz(\d+)/g, ', writing zone $1')
  file.querySelector('title').textContent = 'Liquified Transcription: ' + label
  file.querySelector('.label').textContent = label

  const surfaceId = meiDtDom.querySelector('pb').getAttribute('target').split('#')[1]
  const surface = meiSourceDom.querySelector('surface[xml\\:id="' + surfaceId + '"')
  const graphic = surface.querySelector('graphic[type="facsimile"]')
  const basePath = graphic.getAttribute('target').split('#')[0]
  const params = graphic.getAttribute('target').split('#xywh=')[1]
  const xywh = params.split('&rotate=')[0]
  const pageRotation = params.split('&rotate=')[1] ? params.split('&rotate=')[1] : 0
  const imgPath = basePath + '/' + xywh + '/full/0/default.jpg'

  // file.querySelector('img').remove()

  /*
        Algorithm for getting the x coordinates:
        * one vu is verovioPixelDensity pixels high
        * a staff is 8 vu high
        * take the mm height of the staff, divide it by (8 * verovioPixelDensity) to get the pixel height
        * calculate the y coordinate of the first staff
    */

  file.querySelector('img').setAttribute('src', imgPath)
  const foliumLike = [...meiSourceDom.querySelectorAll('foliaDesc > *')].find(f => {
    const ref = '#' + surfaceId
    return f.getAttribute('recto') === ref || f.getAttribute('verso') === ref || f.getAttribute('outer.recto') === ref || f.getAttribute('inner.verso') === ref || f.getAttribute('inner.recto') === ref || f.getAttribute('outer.verso') === ref
  })

  const foliumWidth = parseFloat(foliumLike.getAttribute('width'))
  const foliumHeight = parseFloat(foliumLike.getAttribute('height'))

  const mediaFragMM = getOuterBoundingRect(0, 0, foliumWidth, foliumHeight, pageRotation)
  const scaleFactor = parseFloat(xywh.split(',')[2]) / mediaFragMM.w

  const imageX = parseFloat(xywh.split(',')[0]) / scaleFactor * verovioPixelDensity * 10

  console.log('left coordinate of image should be ' + imageX)

  // const renderedStaffLines = [...file.querySelector('svg g.staff:not(.bounding-box)').childNodes].filter(node => node.nodeName === 'path')
  // const renderedStaffLineHeight = parseFloat(renderedStaffLines[0].getAttribute('d').split(' ')[1]) - parseFloat(renderedStaffLines[4].getAttribute('d').split(' ')[1])

  // const layout = meiSourceDom.querySelector('layout[xml\\:id="' + surface.getAttribute('decls').substr(1) + '"]')

  // 524 system height

  /*
    const firstNote = meiDtDom.querySelector('note')
    if (firstNote) {
        try {
            const firstNoteDtId = firstNote.getAttribute('xml:id')

            const atNote = [...meiAtDom.querySelectorAll('note[corresp]')].find(note => note.getAttribute('corresp').split(' ').some(value => value.endsWith('#' + firstNoteDtId)))
            const renderedFirstNote = file.querySelector('svg *[data-id="' + atNote.getAttribute('xml:id') + '"]')

            const firstNoteX = parseFloat(firstNote.getAttribute('x'))
            const renderedX = parseFloat(renderedFirstNote.querySelector('.notehead use').getAttribute('x'))
            const firstNoteDtAnimation = [...renderedFirstNote.children].filter(node => node.nodeName === 'animateTransform')[0]
            if (!firstNoteDtAnimation) {
                console.warn('No animation found for first note', renderedFirstNote)
                console.log('children: ', renderedFirstNote.children.length)
                renderedFirstNote.children.forEach(child => {
                    console.log('child: ', child.nodeName)
                })
            }
            // console.log('firstNoteDtAnimation: ', firstNoteDtAnimation)

            const xOff = parseFloat(firstNoteDtAnimation.getAttribute('values').split(';')[0].split(' ')[0])
            const fullRenderedX = renderedX + xOff
            // console.log('firstNote X: ', firstNoteX, ' fullX: ', fullRenderedX)

            const systemOffX = 0
            const fullDataX = firstNoteX + systemOffX

            const scaledDataX = fullDataX * scaleFactor

            console.log('fullRenderedX: ', fullRenderedX, ' scaledDataX: ', scaledDataX)

        } catch (err) {
            file.querySelector('img').remove()
            console.warn('Unable to find a note in transcription, removing facsimile', err)
        }
    } else {
        file.querySelector('img').remove()
        console.warn('Unable to find a note in transcription, removing facsimile')
    }
    */

  return file
}
