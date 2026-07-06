import path from 'path'
import { writeData } from '../../../filehandlers/filehandler.js'

/**
 * Persist a fluid transcripts error/warning report for one output file.
 *
 * @param {Object} params - Structured parameter bundle.
 * @param {Object} params.triple - File tuple containing source/target paths.
 * @param {Error|string} params.error - Error value to log.
 * @param {Array<Object>} params.issues - Non-fatal issue details to include.
 * @param {string} params.severity - Severity marker (`error` or `warning`).
 * @returns {Promise<void>} Promise resolving after log write.
 */
export async function writeFluidTranscriptsErrorLog ({ triple, error, issues = [], severity = 'error' }) {
  if (!triple?.ftSvgPath) return
  if (!error && issues.length === 0) return

  const errorLogPath = buildFluidTranscriptsErrorLogPath(triple.ftSvgPath)
  const reason = error instanceof Error ? error.message : String(error || '')
  const uniqueIssueLines = Array.from(new Set(issues.map(formatFluidTranscriptsIssueLine).filter(Boolean)))
  const lines = [
    `timestamp=${new Date().toISOString()}`,
    'type=fluidTranscripts',
    `severity=${severity}`,
    `inputDt=${triple.dtFullPath || triple.dt || ''}`,
    `inputAt=${triple.atFullPath || triple.at || ''}`,
    `outputFt=${triple.ftSvgPath}`
  ]

  if (reason) {
    lines.push(`reason=${reason}`)
  }

  if (uniqueIssueLines.length > 0) {
    lines.push(`issueCount=${uniqueIssueLines.length}`)
    uniqueIssueLines.forEach((issueLine, index) => {
      lines.push(`issue.${index + 1}=${issueLine}`)
    })
  }

  await writeData(`${lines.join('\n')}\n`, errorLogPath)
}

/**
 * Builds fluid transcripts error log path for the current output file.
 *
 * @param {string} ftSvgPath - Fluid transcripts output SVG path.
 * @returns {string} Error log output path.
 */
function buildFluidTranscriptsErrorLogPath (ftSvgPath) {
  const segments = ftSvgPath.split(path.sep)
  const sourcesIndex = segments.indexOf('sources')
  if (sourcesIndex >= 0) {
    segments[sourcesIndex] = 'errorLogs'
  } else {
    segments.splice(Math.max(0, segments.length - 1), 0, 'errorLogs')
  }

  segments[segments.length - 1] = segments[segments.length - 1].replace(/_ft\.svg$/, '_ft.error.log')
  return segments.join(path.sep)
}

/**
 * Produces a stable one-line summary for one fluid transcripts issue object.
 *
 * @param {Object} issue - Structured issue descriptor.
 * @returns {string} Flattened single-line summary.
 */
function formatFluidTranscriptsIssueLine (issue) {
  return Object.entries(issue || {})
    .map(([key, value]) => `${key}=${String(value ?? '').replace(/\s+/g, ' ').trim()}`)
    .join(';')
}
