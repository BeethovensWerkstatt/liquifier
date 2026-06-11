/**
 * Inject facsimile image and writing-zone shapes overlays plus metadata.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {SVGElement|Document} params.fluidSvg - Fluid transcripts SVG document.
 * @param {Object} params.overlayContext - Resolved overlay geometry context.
 * @param {Object} [params.positionalData] - Positional data with active page stream placement.
 * @param {Document} [params.dtDom] - DT MEI DOM for writing-zone lookup.
 * @param {Document} [params.sourceDom] - Source MEI DOM containing zone coordinates.
 * @param {DOMParser} params.parser - XML parser for shapes SVG import.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} params.logger - Logger instance.
 * @returns {void} No return value.
 */
export function addFacsimile ({ ftSvg, dtSvg, atSvg, atMei, dtMei, sourceMei, reconstructionMei, logger, overlayContext, positioningData }) {
  if (!ftSvg || !overlayContext?.facsimile) return

  const unitsPerMm = 90
  const activePage = positioningData.pages.find(page => page?.currentPage)

  const getXOffset = () => {
    return (activePage && Number.isFinite(activePage?.precedingWidth)) ? activePage.precedingWidth : 0
  }

  /* const getYOffset = () => {
    const atCenterYMm = resolveAtStaffLineCenterMm({ fluidSvg, positionalData, unitsPerMm })
    const dtWritingZoneCenterYMm = resolveDtWritingZoneCenterMm({ overlayContext, dtDom, sourceDom })

    const facsimileMediaCenterYMm = Number.isFinite(overlayContext.facsimile.mediaFragMm?.y) && Number.isFinite(overlayContext.facsimile.mediaFragMm?.h)
      ? overlayContext.facsimile.mediaFragMm.y + (overlayContext.facsimile.mediaFragMm.h / 2)
      : null

    const pageHeightMm = Number.isFinite(overlayContext.facsimile.pageMm?.height) ? overlayContext.facsimile.pageMm.height : 232
    const pageTopMm = Number.isFinite(overlayContext.facsimile.imageMm?.y) ? overlayContext.facsimile.imageMm.y : null
    const facsimileEnvelopeCenterYMm = Number.isFinite(pageTopMm)
      ? pageTopMm + 10 + (pageHeightMm / 2)
      : null

    const facsimileCenterYMm = Number.isFinite(dtWritingZoneCenterYMm)
      ? dtWritingZoneCenterYMm
      : Number.isFinite(facsimileMediaCenterYMm)
        ? facsimileMediaCenterYMm
        : facsimileEnvelopeCenterYMm

    const yOffsetMm = Number.isFinite(atCenterYMm) && Number.isFinite(facsimileCenterYMm)
      ? atCenterYMm - facsimileCenterYMm
      : 0
    return yOffsetMm * unitsPerMm
  } */

  const xOffsetUnits = getXOffset()

  const yOffsetUnits = 5 // getYOffset()

  console.log(2111, positioningData)
  console.log(2112, overlayContext)
  console.log(2113, { xOffsetUnits, yOffsetUnits, unitsPerMm })

  console.log(3112, ftSvg.querySelectorAll('.bw-system-rastrum'))

  const rootSvg = ftSvg
  const definitionSvg = rootSvg.querySelector('svg.definition-scale') || rootSvg
  ensureOverlayFitsDefinitionViewBox({
    definitionSvg,
    overlayContext,
    xOffsetUnits,
    yOffsetUnits,
    unitsPerMm
  })
  normalizeFluidTranscriptsViewport({ rootSvg, definitionSvg })

  const insertionAnchor = definitionSvg.querySelector('g.page-margin') || definitionSvg.firstChild

  const doc = definitionSvg.ownerDocument || definitionSvg
  const facsimileGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
  facsimileGroup.setAttribute('class', 'bw-facsimile-layer')
  if (xOffsetUnits !== 0 || yOffsetUnits !== 0) {
    facsimileGroup.setAttribute('transform', `translate(${xOffsetUnits} ${yOffsetUnits})`)
  }

  const image = doc.createElementNS('http://www.w3.org/2000/svg', 'image')
  image.setAttribute('class', 'bw-facsimile-image')
  image.setAttribute('x', String(overlayContext.facsimile.imageMm.x * unitsPerMm))
  image.setAttribute('y', String(overlayContext.facsimile.imageMm.y * unitsPerMm))
  image.setAttribute('width', String(overlayContext.facsimile.imageMm.width * unitsPerMm))
  image.setAttribute('height', String(overlayContext.facsimile.imageMm.height * unitsPerMm))
  image.setAttribute('href', overlayContext.facsimile.href + '/full/full/0/default.jpg')
  image.setAttribute('preserveAspectRatio', 'none')
  image.setAttribute('opacity', '1')

  if (overlayContext.facsimile.fragment.rotate !== 0) {
    const rotateAngle = overlayContext.facsimile.fragment.rotate * -1
    const rotateCenterX = (overlayContext.facsimile.mediaFragMm.x + (overlayContext.facsimile.mediaFragMm.w / 2)) * unitsPerMm
    const rotateCenterY = (overlayContext.facsimile.mediaFragMm.y + (overlayContext.facsimile.mediaFragMm.h / 2)) * unitsPerMm
    image.setAttribute('transform', `rotate(${rotateAngle} ${rotateCenterX} ${rotateCenterY})`)
  }

  appendOverlayAnimate(image, 'opacity', '1;1;1;0.4;0;0;0;0')
  facsimileGroup.appendChild(image)

  const shapesPath = overlayContext.shapes?.absolutePath
  if (shapesPath && fs.existsSync(shapesPath)) {
    const shapesSvgString = fs.readFileSync(shapesPath, 'utf8')
    const shapesSvg = parser.parseFromString(shapesSvgString, 'image/svg+xml')
    const sourceRoot = shapesSvg.documentElement
    const sourceViewBox = (sourceRoot?.getAttribute('viewBox') || '').split(/\s+/).map(Number)
    const sourceWidth = Number.isFinite(sourceViewBox[2]) && sourceViewBox[2] > 0
      ? sourceViewBox[2]
      : overlayContext.facsimile.widthPx
    const sourceHeight = Number.isFinite(sourceViewBox[3]) && sourceViewBox[3] > 0
      ? sourceViewBox[3]
      : overlayContext.facsimile.heightPx

    const scaledShapes = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
    scaledShapes.setAttribute('class', 'bw-writing-zone-shapes')
    const scaleX = (overlayContext.facsimile.imageMm.width * unitsPerMm) / sourceWidth
    const scaleY = (overlayContext.facsimile.imageMm.height * unitsPerMm) / sourceHeight
    scaledShapes.setAttribute(
      'transform',
      `translate(${overlayContext.facsimile.imageMm.x * unitsPerMm} ${overlayContext.facsimile.imageMm.y * unitsPerMm}) scale(${scaleX} ${scaleY})`
    )

    Array.from(sourceRoot?.children || []).forEach(child => {
      scaledShapes.appendChild(child.cloneNode(true))
    })

    const shapesWorld = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
    shapesWorld.setAttribute('class', 'bw-writing-zone-layer')
    shapesWorld.setAttribute('opacity', '0')

    if (overlayContext.facsimile.fragment.rotate !== 0) {
      const rotateAngle = overlayContext.facsimile.fragment.rotate * -1
      const rotateCenterX = (overlayContext.facsimile.mediaFragMm.x + (overlayContext.facsimile.mediaFragMm.w / 2)) * unitsPerMm
      const rotateCenterY = (overlayContext.facsimile.mediaFragMm.y + (overlayContext.facsimile.mediaFragMm.h / 2)) * unitsPerMm
      shapesWorld.setAttribute('transform', `rotate(${rotateAngle} ${rotateCenterX} ${rotateCenterY})`)
    }

    shapesWorld.appendChild(scaledShapes)
    appendOverlayAnimate(shapesWorld, 'opacity', '0;1;0;0;0;0;0;0')
    facsimileGroup.appendChild(shapesWorld)
  } else if (shapesPath) {
    logger.warn(`[renderFluidTranscriptsSvg] Shapes SVG not found: ${shapesPath}`)
  }

  if (insertionAnchor) {
    definitionSvg.insertBefore(facsimileGroup, insertionAnchor)
  } else {
    definitionSvg.appendChild(facsimileGroup)
  }

  const metadata = doc.createElementNS('http://www.w3.org/2000/svg', 'metadata')
  metadata.setAttribute('id', 'bw-fluid-facsimile-mapping')
  metadata.textContent = JSON.stringify({
    version: 1,
    unitsPerMm,
    surfaceId: overlayContext.surfaceId,
    placement: {
      xOffsetUnits,
      yOffsetUnits,
      xOffsetMm: xOffsetUnits / unitsPerMm,
      yOffsetMm: yOffsetUnits / unitsPerMm
    },
    facsimile: {
      href: overlayContext.facsimile.href,
      widthPx: overlayContext.facsimile.widthPx,
      heightPx: overlayContext.facsimile.heightPx,
      fragment: overlayContext.facsimile.fragment,
      pageMm: overlayContext.facsimile.pageMm,
      mediaFragMm: overlayContext.facsimile.mediaFragMm,
      imageMm: overlayContext.facsimile.imageMm,
      ratioPxPerMm: overlayContext.facsimile.ratioPxPerMm,
      mmPerPx: overlayContext.facsimile.mmPerPx
    },
    shapes: {
      sourcePath: overlayContext.shapes?.absolutePath || null
    }
  })
  rootSvg.appendChild(metadata)
}