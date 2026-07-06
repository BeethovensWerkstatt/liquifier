// the folder in which to search for annotated transcripts
export const dir = './data'
// regex to match annotated / diplomatic transcripts
export const annotatedRegex = /\/annotatedTranscripts\/.*.xml/
export const diplomaticRegex = /\/diplomaticTranscripts\/.*.xml/

export const verovioPixelDensity = 9

export const constants = {
  verovioPixelPerVu: verovioPixelDensity,
  verovioGeneralScaling: 10,
  ftStaticScaling: 1,
  ftRendererDtStaffLineSideMarginMm: 20,
  ftRendererAnimationDuration: '5s',
  ftRendererAnimationRepeatCount: 'indefinite',
  ftRendererReverseAnimations: false,
  ftAssetPhaseOpacityValues: {
    facsimileBg: ['1', '1', '0.5', '0', '0', '0', '0', '0'],
    shapes: ['0', '1', '0', '0', '0', '0', '0', '0'],
    diplomatic: ['0', '0', '1', '1', '1', '1', '1', '1'],
    transcription: ['0', '0', '1', '1', '1', '1', '1', '1'],
    labelsHiddenUntilEnd: ['0', '0', '0', '0', '0', '0', '1', '1']
  },
  ftWritingZoneHighlight: {
    opacity: '1',
    fill: '#00b7ff',
    style: 'stroke: #028cc2; stroke-width: 2px;'
  }
}
