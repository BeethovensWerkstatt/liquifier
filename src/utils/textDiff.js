/**
 * Compute the differences between two strings using a dynamic programming approach.
 * Returns segments that are common, only in source (DT), or only in target (AT).
 * This uses a simplified diff algorithm similar to the Myers algorithm, optimized
 * for short text strings like musical dynamics annotations.
 * computeTextDiff('dimin:', 'dim.')
 * // Returns:
 * // [
 * //   { text: 'dim', type: 'common' },
 * //   { text: 'in:', type: 'delete' },
 * //   { text: '.', type: 'insert' }
 * // ]
 *
 * @example
 * @param {string} source - Source string (DT text)
 * @param {string} target - Target string (AT text)
 * @returns {Array<{text: string, type: 'common'|'delete'|'insert'} >} Array of text segments
 */
export function computeTextDiff (source, target) {
  const sourceLen = source.length
  const targetLen = target.length

  // Build a matrix for dynamic programming (Longest Common Subsequence approach)
  // lcs[i][j] = length of longest common subsequence of source[0..i-1] and target[0..j-1]
  const lcs = Array(sourceLen + 1).fill(null).map(() => Array(targetLen + 1).fill(0))

  // Fill the LCS matrix
  for (let i = 1; i <= sourceLen; i++) {
    for (let j = 1; j <= targetLen; j++) {
      if (source[i - 1] === target[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
      }
    }
  }

  // Backtrack to find the actual diff
  const segments = []
  let i = sourceLen
  let j = targetLen

  // Work backwards from the end of both strings
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && source[i - 1] === target[j - 1]) {
      // Common character - but we need to collect consecutive common chars
      let commonText = ''
      while (i > 0 && j > 0 && source[i - 1] === target[j - 1]) {
        commonText = source[i - 1] + commonText
        i--
        j--
      }
      segments.unshift({ text: commonText, type: 'common' })
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      // Character only in target (insertion in AT)
      let insertText = ''
      while (j > 0) {
        if (!(i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
          break
        }
        // Check if next iteration would be a match
        if (i > 0 && j > 0 && source[i - 1] === target[j - 1]) {
          break
        }
        insertText = target[j - 1] + insertText
        j--
        // After moving j, check if we'd enter a match region
        if (i > 0 && j > 0 && source[i - 1] === target[j - 1]) {
          break
        }
      }
      if (insertText) {
        segments.unshift({ text: insertText, type: 'insert' })
      }
    } else if (i > 0) {
      // Character only in source (deletion from DT)
      let deleteText = ''
      while (i > 0) {
        if (!(j === 0 || lcs[i - 1][j] >= lcs[i][j - 1])) {
          break
        }
        // Check if next iteration would be a match
        if (i > 0 && j > 0 && source[i - 1] === target[j - 1]) {
          break
        }
        deleteText = source[i - 1] + deleteText
        i--
        // After moving i, check if we'd enter a match region
        if (i > 0 && j > 0 && source[i - 1] === target[j - 1]) {
          break
        }
      }
      if (deleteText) {
        segments.unshift({ text: deleteText, type: 'delete' })
      }
    }
  }

  return segments
}

/**
 * Compute text diff with word-level granularity instead of character-level.
 * Useful for longer text where word-by-word comparison is more appropriate.
 *
 * @param {string} source - Source string (DT text)
 * @param {string} target - Target string (AT text)
 * @returns {Array<{text: string, type: 'common'|'delete'|'insert'} >} Array of text segments
 */
export function computeWordDiff (source, target) {
  // For now, just use character-level diff
  // Could be extended to proper word-level diff if needed
  return computeTextDiff(source, target)
}
