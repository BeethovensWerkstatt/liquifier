import { JSDOM } from 'jsdom'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import minimist from 'minimist'

import { walk, getFilesObject, fetchData, writeData, generateHtmlWrapper, gitFileDate, changedFiles, changedFilesSince } from './src/filehandler.js'
import { diplomaticRegex, dir } from './src/config.mjs'
// import { prepareDtForRendering } from './src/diplomaticTranscripts.js'
import { prepareAtDomForRendering } from './src/annotatedTranscripts.js'
// import { generateFluidTranscription } from './src/fluidTranscripts.js'

import { renderData, renderMidi } from './src/verovioHandler.js'
import { getPageDimensions } from './src/utils.js'

const { DOMParser } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

const main = async () => {
    const args = minimist(process.argv.slice(2))
    const VerovioModule = await createVerovioModule()
    const verovio = new VerovioToolkit(VerovioModule)

    args.types = args.types?.split(',') || ['at', 'dt', 'ft']
    args.media = args.media?.split(',') || ['svg', 'midi', 'html']
    args.v = !args.q && args.v

    if (args.v) {
        console.log('types:', args.types, 'media:', args.media)
    }

    // Check if the 'fileNames' parameter is provided
    if (args._?.length > 0 || process.env.fileNames) {
        const fileNames = args._ || process.env.fileNames.split(',')

        // Run a function on each file
        fileNames.forEach((fileName) => {
            // Call your function here with the 'fileName'
            // For example:
            // yourFunction(fileName)
            const triple = getFilesObject(fileName)
            if (triple) {
                const data = fetchData(triple, args.v)
                // console.log(data)
                handleData(data, triple, verovio, args)
            }
        })
    } if(args.full) {
        await walk(dir, (err, results) => {
            if (err) {
                console.warn('filewalker has problems: ' + err, err)
            }
            // console.log('results: ', results)
            results.forEach(async triple => {
                const data = await fetchData(triple, args.v)
                // console.log('data: ')
                // console.log(data)               
                handleData(data, triple, verovio, args)
            })
        })
    } else {
        const hours = args.hours || 24
        const since = args.since ? new Date(args.since) : new Date(Date.now() - ((+hours)*60*60*1000))
        const headFiles = changedFilesSince(since) // changedFiles('HEAD')
        const results = Object.keys(headFiles).filter(fileName => fileName.match(diplomaticRegex)).map(fileName => getFilesObject(fileName)).filter(triple => triple)
        if (args.v) {
            console.log('files committed since ', since, ':\n', headFiles)
            console.log('files to process:', results)
        }
        
        results.forEach(async triple => {
            const data = await fetchData(triple, args.v)
            handleData(data, triple, verovio, args)
        })
    }
}

main()

const handleData = async (data, triple, verovio, args) => {
    const {
        dt: dtPath, dtDate, dtSvgPath, dtSvgDate,
        at: atPath, atDate, atSvgPath, atSvgDate, atMidPath, atMidDate,
        ftSvgPath, ftSvgDate, ftHtmlPath, ftHtmlDate
    } = triple
    /*
    const dtSvgPath = triple.dt.replace('.xml', '.svg').replace('data/', 'cache/')
    const atSvgPath = triple.at.replace('.xml', '.svg').replace('data/', 'cache/')
    const atMidPath = triple.at.replace('.xml', '.mid').replace('data/', 'cache/').replace('/annotatedTranscripts/', '/annotatedMidi/')
    const ftSvgPath = triple.at.replace('_at.xml', '_ft.svg').replace('data/', 'cache/').replace('/annotatedTranscripts/', '/fluidTranscripts/')
    const ftHtmlPath = ftSvgPath.replace('.svg', '.html').replace('/fluidTranscripts/', '/fluidHTML/')

    const atDate = gitFileDate(triple.at)
    const atSvgDate = gitFileDate(atSvgPath)
    const atMidDate = gitFileDate(atMidPath)
    const dtDate = gitFileDate(triple.dt)
    const dtSvgDate = gitFileDate(dtSvgPath)
    */
    if (!args.q) {
        if (args.types.indexOf('at') >= 0) {
            console.log(atPath, atDate, atSvgDate)
        }
        if (args.types.indexOf('dt') >= 0) {
            console.log(dtPath, dtDate, dtSvgDate)
        }
        if (args.types.indexOf('ft') >= 0) {
            console.log(ftSvgDate, ftSvgDate)
        }
    }

    try {
        const pageDimensions = getPageDimensions(data.sourceDom, data.dtDom)

        if (args.types.indexOf('at') >= 0) {
            if (args.media.indexOf('svg') >= 0) {
                if (args.recreate || atDate.getTime() > atSvgDate.getTime()) {
                    if (!args.q) {
                        console.log('Rendering Annotated Transcript for ' + atSvgPath + ' ...')
                    }
                    const atOutDom = prepareAtDomForRendering(data.atDom, data.dtDom, pageDimensions)
                    const atSvgString = renderData(atOutDom, verovio, 'annotated', pageDimensions)
                    writeData(atSvgString, atSvgPath)
                } else {
                    if (!args.q) {
                        console.log('Skipping Annotated Transcript for ' + atSvgPath)
                    }
                }
            }
            if (args.media.indexOf('midi') >= 0) {
                if (args.recreate || atDate.getTime() > atMidDate.getTime()) {
                    if (!args.q) {
                        console.log('Rendering Annotated MIDI for ' + atMidPath + ' ...')
                    }
                    const atOutDom = prepareAtDomForRendering(data.atDom, data.dtDom, pageDimensions)
                    const atMidBuffer = renderMidi(atOutDom, verovio)
                    writeData(atMidBuffer, atMidPath)
                } else {
                    if (!args.q) {
                        console.log('Skipping Annotated MIDI for ' + atMidPath)
                    }
                }
            }
        }

        if (args.types.indexOf('dt') >= 0) {
            if (args.media.indexOf('svg') >= 0) {
                if (args.recreate || dtDate.getTime() > dtSvgDate.getTime()) {
                    if (!args.q) {
                        console.log('Rendering Diplomatic Transcript for ' + dtSvgPath + ' ...')
                    }
                    console.log('TODO create diplomatic SVG', dtSvgPath)
                } else {
                    if (!args.q) {
                        console.log('Skipping Annotated Transcript for ' + dtSvgPath)
                    }
                }
            }
        }

        if (args.types.indexOf('ft') >= 0) {
            if (args.media.indexOf('svg') >= 0) {
                if (args.recreate || atDate.getTime() > ftSvgDate.getTime() || dtDate.getTime() > ftSvgDate.getTime()) {
                    if (!args.q) {
                        console.log('Rendering Fluid Transcript for ' + ftSvgPath + ' ...')
                    }
                    console.log('TODO create fluid SVG', ftSvgPath)
                } else {
                    if (!args.q) {
                        console.log('Skipping Fluid Transcript for ' + ftSvgPath)
                    }
                }
            }
            if (args.media.indexOf('html') >= 0) {
                if (args.recreate || atDate.getTime() > ftHtmlDate.getTime() || dtDate.getTime() > ftHtmlDate.getTime()) {
                    if (!args.q) {
                        console.log('Rendering Fluid HTML for ' + ftHtmlPath + ' ...')
                    }
                    console.log('TODO create fluid HTML', ftHtmlPath)
                } else {
                    if (!args.q) {
                        console.log('Skipping Fluid HTML for ' + ftHtmlPath)
                    }
                }
            }
        }

        
        
        /*
        const dtOutDom = prepareDtForRendering(data, pageDimensions)
        const dtSvgString = renderData(dtOutDom, verovio, 'diplomatic', pageDimensions)
        const finalDtDom = finalizeDiploTrans(dtSvgString)
    
        const atOutDom = prepareAtDomForRendering(data, dtOutDom, pageDimensions)
        const atSvgString = renderData(atOutDom, verovio, 'annotated', pageDimensions)

        const parser = new DOMParser()
        const dtSvgDom = parser.parseFromString(dtSvgString, 'image/svg+xml')
        const atSvgDom = parser.parseFromString(atSvgString, 'image/svg+xml')

        const ftSvgDom = generateFluidTranscription({ atSvgDom, dtSvgDom, atOutDom, dtOutDom, sourceDom: data.sourceDom })

        // const ftSvgPath = triple.at.replace('.xml', '.svg').replace('data/', 'cache/').replace('/annotatedTranscripts/', '/fluidTranscripts/')
        console.log('Finished Rendering for ' + dtSvgPath)

        const serializer = new dom.window.XMLSerializer()

        writeData(serializer.serializeToString(finalDtDom), dtSvgPath)
        writeData(atSvgString, atSvgPath)
        writeData(serializer.serializeToString(ftSvgDom), ftSvgPath)
        
        const html = generateHtmlWrapper(ftSvgDom, data.sourceDom, data.dtDom, data.atDom, htmlPath.split('/').pop())
        writeData(serializer.serializeToString(html), htmlPath)
        // console.log(dtSvgString)
        */
    } catch (err) {
        console.error('[ERROR]: Unable to process files for ' + dtSvgPath + ': ' + err + '\n\n', err)
    }
}