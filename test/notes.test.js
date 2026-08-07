import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyNotes } from '../src/preparation/liquify/notes.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyNotes keeps cross-staff phase-4 stems at the diplomatic length', () => {
	const ftSvg = parser.parseFromString(`
		<svg xmlns="http://www.w3.org/2000/svg"><g class="beam" data-id="b1">
			<g class="note" data-id="a0"><g class="notehead"><use transform="translate(0, 100)"/></g><animateTransform attributeName="transform" values="0 0;0 0;0 0;0 50;0 50;0 0;0 0;0 0"/></g>
			<g class="note" data-id="a1">
				<g class="notehead"><use transform="translate(0, 100)"/></g>
				<g class="stem"><path d="M0 100 L0 400"/></g>
			</g>
		</g></svg>
	`, 'image/svg+xml').documentElement
	const dtSvg = parser.parseFromString(`
		<svg xmlns="http://www.w3.org/2000/svg">
			<g class="note" data-id="d0"><g class="notehead"><use x="0" y="150"/></g><g class="stem"><path d="M0 0 L0 50"/></g></g>
			<g class="note" data-id="d1"><g class="notehead"><use x="0" y="250"/></g><g class="stem"><path d="M0 0 L0 50"/></g></g>
		</svg>
	`, 'image/svg+xml').documentElement
	const atRegSvgDom = parser.parseFromString(`
		<svg xmlns="http://www.w3.org/2000/svg">
			<g class="note" data-id="a0"><g class="notehead"><use transform="translate(0, 100)"/></g></g>
			<g class="note" data-id="a1"><g class="notehead"><use transform="translate(0, 100)"/></g></g>
		</svg>
	`, 'image/svg+xml').documentElement
	const atMeiDom = parser.parseFromString(`
		<mei><staff n="2"><layer><beam xml:id="b1"><note xml:id="a0" stem.dir="down"/><note xml:id="a1" staff="1" stem.dir="down"/></beam></layer></staff></mei>
	`, 'text/xml')
	const calls = []

	liquifyNotes(ftSvg, dtSvg, atMeiDom, {
		scaleFactor: 2,
		getNewPos: (at, dt) => ({ x: dt.x, y: dt.y }),
		correspMappings: new Map([['a0', ['d0']], ['a1', ['d1']]]),
		atRegSvgDom,
		setAnimation: descriptor => {
			calls.push(descriptor)
			if (descriptor.states.finding?.type !== 'translate') return

			const animation = descriptor.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'animateTransform')
			animation.setAttribute('attributeName', 'transform')
			const { finding, normalization, regulation } = descriptor.states
			animation.setAttribute('values', `0 0;0 0;${finding.val};${normalization.val};${normalization.val};${regulation.val};${regulation.val};${regulation.val}`)
			descriptor.element.appendChild(animation)
		}
	})

	const stemAnimation = calls.find(call => call.element.parentNode?.parentNode?.getAttribute('data-id') === 'a1')
	assert.equal(stemAnimation.states.finding.val, 'M0 100 L0 200')
	assert.equal(stemAnimation.states.normalization.val, 'M0 100 L0 200')
})
