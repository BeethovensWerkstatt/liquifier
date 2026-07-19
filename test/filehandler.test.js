import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getFilesObject } from '../src/filehandlers/filehandler.js'

/**
 * Writes the output data.
 *
 * @param {string} filePath - File or resource path.
 * @param {string} content - String input used by this function.
 * @returns {void} No return value.
 */
const write = (filePath, content = '<mei/>') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

test('getFilesObject returns expected page-based output paths', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))
  const inputDir = path.join(tmpRoot, 'in')
  const outputDir = path.join(tmpRoot, 'out')

  const relDt = 'sources/SRC_01/diplomaticTranscripts/SRC_01_p005_wz06_dt.xml'
  const relAt = 'sources/SRC_01/annotatedTranscripts/SRC_01_p005_wz06_at.xml'
  const relSource = 'sources/SRC_01/SRC_01.xml'

  write(path.join(inputDir, relDt))
  write(path.join(inputDir, relAt))
  write(path.join(inputDir, relSource))

  const triple = getFilesObject(relDt, inputDir, outputDir)
  assert.ok(triple)

  assert.equal(triple.page, 'p005')
  assert.equal(
    triple.dtSvgPath,
    path.join(outputDir, 'sources/SRC_01/diplomaticTranscripts/p005/SRC_01_p005_wz06_dt.svg')
  )
  assert.equal(
    triple.atSvgPath,
    path.join(outputDir, 'sources/SRC_01/annotatedTranscripts/p005/SRC_01_p005_wz06_at.svg')
  )
  assert.equal(
    triple.atMidOrigPath,
    path.join(outputDir, 'sources/SRC_01/annotatedMidi/p005/SRC_01_p005_wz06_at_orig.mid')
  )
  assert.equal(
    triple.atMidRegPath,
    path.join(outputDir, 'sources/SRC_01/annotatedMidi/p005/SRC_01_p005_wz06_at_reg.mid')
  )
  assert.equal(
    triple.editedAtPath,
    path.join(outputDir, 'sources/SRC_01/editedAT/p005/SRC_01_p005_wz06_eat.xml')
  )
  assert.equal(
    triple.ftSvgPath,
    path.join(outputDir, 'sources/SRC_01/fluidTranscripts/p005/SRC_01_p005_wz06_ft.svg')
  )
  assert.equal(
    triple.fsSvgPath,
    path.join(outputDir, 'sources/SRC_01/fluidSystems/p005/SRC_01_p005_wz06_fs.svg')
  )
  assert.equal(
    triple.ftHtmlPath,
    path.join(outputDir, 'sources/SRC_01/fluidHTML/p005/SRC_01_p005_wz06_ft.html')
  )

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('getFilesObject returns undefined when related files are missing', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))
  const inputDir = path.join(tmpRoot, 'in')
  const outputDir = path.join(tmpRoot, 'out')

  const relDt = 'sources/SRC_02/diplomaticTranscripts/SRC_02_p019_wz02_dt.xml'
  const relSource = 'sources/SRC_02/SRC_02.xml'

  write(path.join(inputDir, relDt))
  write(path.join(inputDir, relSource))

  const triple = getFilesObject(relDt, inputDir, outputDir)
  assert.equal(triple, undefined)

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('getFilesObject resolves annotated transcript symlink targets', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))
  const inputDir = path.join(tmpRoot, 'in')
  const outputDir = path.join(tmpRoot, 'out')

  const relDt = 'sources/SRC_03/diplomaticTranscripts/SRC_03_p007_wz01_dt.xml'
  const relSymlink = 'sources/SRC_03/annotatedTranscripts/SRC_03_p007_wz01_symlink.xml'
  const relAtTarget = 'sources/SRC_03/annotatedTranscripts/SRC_03_p006_wz01_at.xml'
  const relSource = 'sources/SRC_03/SRC_03.xml'

  write(path.join(inputDir, relDt))
  write(path.join(inputDir, relAtTarget))
  write(path.join(inputDir, relSource))

  write(
    path.join(inputDir, relSymlink),
    `<?xml version="1.0" encoding="UTF-8"?>\n<relation xmlns="http://www.music-encoding.org/ns/mei" rel="symlink" target="../annotatedTranscripts/SRC_03_p006_wz01_at.xml"/>`
  )

  const triple = getFilesObject(relDt, inputDir, outputDir)
  assert.ok(triple)
  assert.equal(triple.atFullPath, path.join(inputDir, relAtTarget))

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})
