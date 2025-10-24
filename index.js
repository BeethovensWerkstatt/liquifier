import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import minimist from 'minimist'

import { getFilesObject, fetchData, writeData } from './src/filehandler.js'
import { prepareAtDomForRendering } from './src/annotatedTranscripts.js'

import { renderData, renderMidi } from './src/verovioHandler.js'
import { getPageDimensions } from './src/utils.js'
import { checkThulemeierAvailability } from './src/thulemeierHandler.js'

const main = async () => {
  const args = minimist(process.argv.slice(2))
  const VerovioModule = await createVerovioModule()
  const verovio = new VerovioToolkit(VerovioModule)

  // Check Thulemeier availability
  const thulemeierAvailable = await checkThulemeierAvailability()
  if (!args.q) {
    console.log('Thulemeier rendering:', thulemeierAvailable ? 'available' : 'not available')
  }

  // Set up input and output directories
  const inputDir = args['input-dir'] || args.i || './'
  const outputDir = args['output-dir'] || args.o || './cache'

  if (!args.q) {
    console.log('Input directory:', inputDir)
    console.log('Output directory:', outputDir)
  }

  args.types = args.types?.split(',') || ['at', 'dt', 'ft']
  args.media = args.media?.split(',') || ['svg', 'midi', 'html']
  args.v = !args.q && args.v

  if (args.v) {
    console.log('types:', args.types, 'media:', args.media)
  }

  // Check if the 'fileNames' parameter is provided
  if (args._?.length > 0 || process.env.fileNames) {
    const fileNames = args._ || process.env.fileNames.split(',')
    if (args.v) {
      console.log('Processing files:', fileNames)
    }
    // Process files sequentially
    for (const fileName of fileNames) {
      const triple = getFilesObject(fileName, inputDir, outputDir)
      if (args.v) {
        console.log('File triple:', triple)
      }
      if (triple) {
        const data = await fetchData(triple, args.v, inputDir)
        if (args.v) {
          console.log('Fetched data:', data)
        }
        await handleData(data, triple, verovio, args)
      }
    }
  } else if (args.full) {
    await walk(dir, (err, results) => {
      if (err) {
        console.warn('filewalker has problems: ' + err, err)
      }
      // console.log('results: ', results)
      results.forEach(async triple => {
        const data = await fetchData(triple, args.v, inputDir)
        // console.log('data: ')
        // console.log(data)
        handleData(data, triple, verovio, args)
      })
    })
  } else {
    const hours = args.hours || 24
    const since = args.since ? new Date(args.since) : new Date(Date.now() - ((+hours) * 60 * 60 * 1000))
    const headFiles = changedFilesSince(since) // changedFiles('HEAD')
    const results = Object.keys(headFiles).filter(fileName => fileName.match(diplomaticRegex)).map(fileName => getFilesObject(fileName, inputDir, outputDir)).filter(triple => triple)
    if (args.v) {
      console.log('files committed since ', since, ':\n', headFiles)
      console.log('files to process:', results)
    }

    results.forEach(async triple => {
      const data = await fetchData(triple, args.v, inputDir)
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

  if (args.v) {
    console.log('Processing triple:', triple)
    console.log('Processing data:', data)
  }

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
    if (args.v) {
      console.log('Page dimensions:', pageDimensions)
    }

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
     * OLD IMPLEMENTATION - Keep for reference when implementing TODOs above
     * This code shows how DT/FT rendering used to work before the refactor.
     * Functions exist in: src/mei.js (prepareDtForRendering),
     *                    src/fluidTranscripts.js (generateFluidTranscription),
     *                    src/filehandler.js (generateHtmlWrapper)
     * Note: finalizeDiploTrans() doesn't exist - needs to be recreated or removed
     */
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
