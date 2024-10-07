import { walk, getFilesObject, fetchData, writeData } from './src/filehandler.js'
import { dir } from './src/config.mjs'
import { prepareDtForRendering } from './src/diplomaticTranscripts.js'
import { prepareAtForRendering } from './src/annotatedTranscripts.js'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'

import { renderData } from './src/verovioHandler.js'


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
    }
}

main()

const handleData = async (data, triple, verovio) => {
    const dtOutDom = prepareDtForRendering(data)
    const atOutDom = prepareAtForRendering(data, dtOutDom)

    const dtSvgString = renderData(dtOutDom, verovio)
    const atSvgString = renderData(atOutDom, verovio)

    const dtSvgPath = triple.dt.replace('.xml', '.svg').replace('data/', 'cache/')
    const atSvgPath = triple.at.replace('.xml', '.svg').replace('data/', 'cache/')
    // const ftSvgPath = triple.at.replace('.xml', '.svg').replace('data/', 'cache/').replace('/annotatedTranscripts/', '/fluidTranscripts/')
    console.log('Finished Rendering for ' + dtSvgPath)

    writeData(dtSvgString, dtSvgPath)
    writeData(atSvgString, atSvgPath)
    // console.log(dtSvgString)
}