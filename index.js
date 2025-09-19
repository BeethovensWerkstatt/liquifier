import { JSDOM } from 'jsdom'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'

import { walk, getFilesObject, fetchData, writeData, generateHtmlWrapper, gitFileDate, changedFiles } from './src/filehandler.js'
import { diplomaticRegex, dir } from './src/config.mjs'
import { prepareDtForRendering, finalizeDiploTrans } from './src/diplomaticTranscripts.js'
import { prepareAtForRendering } from './src/annotatedTranscripts.js'
import { generateFluidTranscription } from './src/fluidTranscripts.js'

import { renderData } from './src/verovioHandler.js'
import { getPageDimensions } from './src/utils.js'

const { DOMParser } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

const main = async () => {
    const VerovioModule = await createVerovioModule()
    const verovio = new VerovioToolkit(VerovioModule)

    // Check if the 'fileNames' parameter is provided
    if (process.env.fileNames) {
        const fileNames = process.env.fileNames.split(',')

        // Run a function on each file
        fileNames.forEach((fileName) => {
            // Call your function here with the 'fileName'
            // For example:
            // yourFunction(fileName)
            const triple = getFilesObject(fileName)
            if (triple) {
                const data = fetchData(triple)
                // console.log(data)
                handleData(data, verovio)
            }
        })
    } else {
        const headFiles = changedFiles()
        const results = headFiles.files.filter(fileName => fileName.match(diplomaticRegex)).map(fileName => getFilesObject(fileName))
        console.log(results)
        
        results.forEach(async triple => {
            const data = await fetchData(triple)
            handleData(data, triple, verovio)
        })
        /*
        await walk(dir, (err, results) => {
            if (err) {
                console.warn('filewalker has problems: ' + err, err)
            }
            // console.log('results: ', results)
            results.forEach(async triple => {
                const data = {} // await fetchData(triple)
                // console.log('data: ')
                // console.log(data)
                
                handleData(data, triple, verovio)
            })
        })
        */
    }
}

main()

const handleData = async (data, triple, verovio) => {
    const dtSvgPath = triple.dt.replace('.xml', '.svg').replace('data/', 'cache/')
    const atSvgPath = triple.at.replace('.xml', '.svg').replace('data/', 'cache/')
    const ftSvgPath = triple.at.replace('_at.xml', '_ft.svg').replace('data/', 'cache/').replace('/annotatedTranscripts/', '/fluidTranscripts/')
    const htmlPath = ftSvgPath.replace('.svg', '.html').replace('/fluidTranscripts/', '/fluidHTML/')

    const dtDate = gitFileDate(triple.dt)
    const dtSvgDate = gitFileDate(dtSvgPath)

    console.log(triple.dt, dtDate, dtSvgDate)

    try {
        const pageDimensions = getPageDimensions(data.sourceDom, data.dtDom)
        
        const dtOutDom = prepareDtForRendering(data, pageDimensions)
        const dtSvgString = renderData(dtOutDom, verovio, 'diplomatic', pageDimensions)
        const finalDtDom = finalizeDiploTrans(dtSvgString)
    
        const atOutDom = prepareAtForRendering(data, dtOutDom, pageDimensions)
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
    } catch (err) {
        console.error('[ERROR]: Unable to process files for ' + dtSvgPath + ': ' + err + '\n\n', err)
    }
}