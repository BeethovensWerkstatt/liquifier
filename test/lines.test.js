import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { liquifyLines } from '../src/preparation/liquify/lines.js'
import { liquifyRepeats } from '../src/preparation/liquify/repeats.js'

const parseSvg = source => new JSDOM(source, { contentType: 'image/svg+xml' }).window.document.documentElement

const createTools = mappings => {
  const animations = []
  return {
    animations,
    applyUnmatchedClass: element => element.classList.add('unmatched'),
    correspMappings: new Map(mappings),
    getNewPos: (at, dt) => ({ x: at.x + (dt.x * 2), y: at.y + (dt.y * 2) }),
    setAnimation: animation => animations.push(animation)
  }
}

test('liquifyRepeats cross-fades mapped repeat line polygons', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="mRpt" data-id="at-repeat"><path d="M 1 1"/></g>
    </svg>`)
  const dtSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="line mRpt" data-id="dt-repeat"><polygon points="10,20 30,20 30,25 10,25"/></g>
    </svg>`)
  const tools = createTools([['at-repeat', ['dt-repeat']]])

  liquifyRepeats(ftSvg, dtSvg, null, tools)

  assert.equal(ftSvg.querySelector('.mRpt .bw-dt-line')?.getAttribute('points'), '20,40 60,40 60,50 20,50')
  assert.equal(tools.animations.length, 2)
  assert.equal(tools.animations[0].states.finding.val, '0')
  assert.equal(tools.animations[1].states.regulation.val, '0')
})

test('liquifyRepeats fades unmatched repeat symbols in at regulation', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="halfmRpt" data-id="at-repeat"/></svg>')
  const tools = createTools([])

  liquifyRepeats(ftSvg, parseSvg('<svg xmlns="http://www.w3.org/2000/svg"/>'), null, tools)

  assert.ok(ftSvg.querySelector('.halfmRpt').classList.contains('unmatched'))
  assert.equal(tools.animations.length, 1)
  assert.equal(tools.animations[0].states.finding, null)
  assert.equal(tools.animations[0].states.regulation.val, 'inline')
})

test('liquifyLines cross-fades mapped glissando line polygons', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="gliss" data-id="at-gliss"><path d="M 2 2"/></g></svg>')
  const dtSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="line gliss" data-id="dt-gliss"><polygon points="40,50 60,50 60,55 40,55"/></g></svg>')
  const tools = createTools([['at-gliss', ['dt-gliss']]])

  liquifyLines(ftSvg, dtSvg, null, tools)

  assert.equal(ftSvg.querySelector('.gliss .bw-dt-line')?.getAttribute('points'), '80,100 120,100 120,110 80,110')
  assert.equal(tools.animations.length, 2)
  assert.equal(tools.animations[0].states.finding.val, '0')
  assert.equal(tools.animations[1].states.regulation.val, '0')
})
