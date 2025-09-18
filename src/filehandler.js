import fs from 'fs'
import path from 'path'
import { readFile } from 'node:fs/promises'
import { execSync } from 'child_process'
import { annotatedRegex, diplomaticRegex, verovioPixelDensity } from './config.mjs'
import { getOuterBoundingRect } from './utils.js'
// import { get } from 'http'
// import { DOMParser } from 'xmldom-qsa'
import { JSDOM } from 'jsdom'
const { DOMParser } = new JSDOM().window

const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)
const serializer = new dom.window.XMLSerializer()

/**
* Walk through the directory and return all files
* @param {*} dir 
* @param {*} regex 
* @param {*} done 
*/
export async function walk (dir, done) {
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
                if (stat && stat.isDirectory()) {

                    // If it is, walk again
                    walk(file, function (err, res) {
                        results = results.concat(res)

                        if (!--pending) { done(null, results) }
                    })
                } else {
                    if(file.match(diplomaticRegex)) {
                        const obj = getFilesObject(file)
                        
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
 * given either the path of an annotated transcript, return the paths to all three relevant files
 * @param {*} path 
 */
export function getFilesObject (file) {
    const dtFileExists = fs.existsSync(file)
                        
    // file is a diplomatic transcript, now check for other types
    const atFile = file.replace('diplomaticTranscripts', 'annotatedTranscripts').replace('_dt.xml', '_at.xml')
    const atFileExists = fs.existsSync(atFile)
    
    const regex = /_p\d+_wz\d+_dt/
    const sourceFile = file.replace('/diplomaticTranscripts/', '/').replace(regex, '')
    const sourceFileExists = fs.existsSync(sourceFile)
    
    if (dtFileExists && atFileExists && sourceFileExists) {
        return {
            dt: file,
            at: atFile,
            source: sourceFile
        }
    }
}

export async function fetchData (triple) {
    const prefix =  './' //'/usr/src/app/'
    const sourcePath = prefix + triple.source
    const dtPath = prefix + triple.dt
    const atPath = prefix + triple.at

    const parser = new DOMParser()

    console.log('sourcePath: ' + sourcePath)

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
        atDom: parser.parseFromString(at, 'text/xml') }
    } catch (err) {
      console.warn('Error in fetchData: ' + err, err)
    }
}

export async function writeData (content, filePath) {
    fs.promises.mkdir(path.dirname(filePath), {recursive: true})
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
    const label =  path.replace('_ft.html' , '').split('_').join(' ').replace(/ p(\d+)/g, ', page $1').replace(/ wz(\d+)/g, ', writing zone $1')
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
    
    file.querySelector('img').remove()
    /*
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

    const renderedStaffLines = [...file.querySelector('svg g.staff:not(.bounding-box)').childNodes].filter(node => node.nodeName === 'path')
    const renderedStaffLineHeight = parseFloat(renderedStaffLines[0].getAttribute('d').split(' ')[1]) - parseFloat(renderedStaffLines[4].getAttribute('d').split(' ')[1])

    const layout = meiSourceDom.querySelector('layout[xml\\:id="' + surface.getAttribute('decls').substr(1) + '"]')
    */
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

export const gitFileDate = (file) => {
    let date = 0
    try {
        date = execSync(
            `git log -n 1 --pretty=format:%cI -- "${file}"`, 
            { encoding: 'utf-8' }
        ) || 0
        // console.log(`${file}: ${date}`)
    } catch (e) {
        console.error(e)
    }
    return new Date(date)
}
