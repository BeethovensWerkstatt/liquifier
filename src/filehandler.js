import fs from 'fs'
import path from 'path'
import { readFile } from 'node:fs/promises'
import { annotatedRegex, diplomaticRegex } from './config.mjs'
// import { get } from 'http'
// import { DOMParser } from 'xmldom-qsa'
import { JSDOM } from 'jsdom'
const { DOMParser } = new JSDOM().window

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