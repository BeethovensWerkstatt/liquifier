import { JSDOM } from 'jsdom'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import minimist from 'minimist'

import { walk, getFilesObject, fetchData, writeData, generateHtmlWrapper, gitFileDate, changedFiles, changedFilesSince } from './src/filehandler.js'
import { diplomaticRegex, dir } from './src/config.mjs'
// import { prepareDtForRendering } from './src/diplomaticTranscripts.js'
import { prepareAtDomForRendering } from './src/annotatedTranscripts.js'
// import { generateFluidTranscription } from './src/fluidTranscripts.js'

import { renderData } from './src/verovioHandler.js'
import { getPageDimensions } from './src/utils.js'

const { DOMParser } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

const main = async () => {
    const args = minimist(process.argv.slice(2))
    const VerovioModule = await createVerovioModule()
    const verovio = new VerovioToolkit(VerovioModule)

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
                const data = fetchData(triple)
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
                const data = await fetchData(triple)
                // console.log('data: ')
                // console.log(data)               
                handleData(data, triple, verovio)
            })
        })
    } else {
        const hours = args.hours || 24
        const since = args.since ? new Date(args.since) : new Date(Date.now() - ((+hours)*60*60*1000))
        if (!args.q) {
            console.log('files committed since ...', since)
        }
        const headFiles = changedFilesSince(since) // changedFiles('HEAD')
        const results = Object.keys(headFiles).filter(fileName => fileName.match(diplomaticRegex)).map(fileName => getFilesObject(fileName)).filter(triple => triple)
        // console.log(headFiles, results)
        
        results.forEach(async triple => {
            const data = await fetchData(triple)
            handleData(data, triple, verovio, args)
        })
    }
}

main()

const handleData = async (data, triple, verovio, args) => {
    const dtSvgPath = triple.dt.replace('.xml', '.svg').replace('data/', 'cache/')
    const atSvgPath = triple.at.replace('.xml', '.svg').replace('data/', 'cache/')
    const ftSvgPath = triple.at.replace('_at.xml', '_ft.svg').replace('data/', 'cache/').replace('/annotatedTranscripts/', '/fluidTranscripts/')
    const htmlPath = ftSvgPath.replace('.svg', '.html').replace('/fluidTranscripts/', '/fluidHTML/')

    const atDate = gitFileDate(triple.at)
    const atSvgDate = gitFileDate(atSvgPath)
    const dtDate = gitFileDate(triple.dt)
    const dtSvgDate = gitFileDate(dtSvgPath)

    if (!args.q) {
        console.log(triple.at, atDate, atSvgDate)
        console.log(triple.dt, dtDate, dtSvgDate)
    }

    try {
        const pageDimensions = getPageDimensions(data.sourceDom, data.dtDom)

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