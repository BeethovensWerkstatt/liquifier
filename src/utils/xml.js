const INDENT = '  '

/**
 * Escapes text.
 *
 * @param {string} value - String input used by this function.
 * @returns {void} No return value.
 */
const escapeText = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

/**
 * Escapes attribute.
 *
 * @param {string} value - String input used by this function.
 * @returns {void} No return value.
 */
const escapeAttribute = (value) => escapeText(value)
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

/**
 * Sorts attributes.
 *
 * @param {Object} attributes - Input object used by this function.
 * @returns {void} No return value.
 */
const sortAttributes = (attributes) => [...attributes]
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * Renders attributes.
 *
 * @param {Element} element - Element processed by this function.
 * @returns {void} No return value.
 */
const renderAttributes = (element) => {
  if (!element.attributes || element.attributes.length === 0) return ''

  return sortAttributes(element.attributes)
    .map(attr => `${attr.name}="${escapeAttribute(attr.value)}"`)
    .join(' ')
}

/**
 * Normalizes text.
 *
 * @param {string} text - String input used by this function.
 * @returns {void} No return value.
 */
const normalizeText = (text) => text.replace(/\s+/g, ' ').trim()

/**
 * Renders node.
 *
 * @param {Element} node - Element processed by this function.
 * @param {number} level - Numeric input used by this function.
 * @returns {void} No return value.
 */
const renderNode = (node, level = 0) => {
  const indent = INDENT.repeat(level)

  if (node.nodeType === 1) {
    const attrs = renderAttributes(node)
    const open = attrs ? `<${node.nodeName} ${attrs}>` : `<${node.nodeName}>`

    const meaningfulChildren = Array.from(node.childNodes)
      .map(child => {
        if (child.nodeType !== 3) return child
        const text = normalizeText(child.nodeValue || '')
        if (!text) return null
        const clone = child.cloneNode()
        clone.nodeValue = text
        return clone
      })
      .filter(Boolean)

    if (meaningfulChildren.length === 0) {
      const empty = attrs ? `<${node.nodeName} ${attrs}/>` : `<${node.nodeName}/>`
      return `${indent}${empty}`
    }

    const onlyTextChild = meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === 3
    if (onlyTextChild) {
      const text = escapeText(meaningfulChildren[0].nodeValue || '')
      return `${indent}${open}${text}</${node.nodeName}>`
    }

    const renderedChildren = meaningfulChildren
      .map(child => renderNode(child, level + 1))
      .filter(line => line.length > 0)
      .join('\n')

    return `${indent}${open}\n${renderedChildren}\n${indent}</${node.nodeName}>`
  }

  if (node.nodeType === 3) {
    const text = normalizeText(node.nodeValue || '')
    return text ? `${indent}${escapeText(text)}` : ''
  }

  if (node.nodeType === 7) {
    const data = node.data ? ` ${node.data}` : ''
    return `${indent}<?${node.target}${data}?>`
  }

  if (node.nodeType === 8) {
    return `${indent}<!--${node.nodeValue || ''}-->`
  }

  return ''
}

/**
 * Serialize an XML document into a deterministic, indented string.
 * Uses two-space indentation and sorted attributes for stable output.
 *
 * @param {Document} doc - Source MEI/XML document used in this operation.
 * @returns {string} Resulting string.
 */
export function serializeXmlCanonical (doc) {
  const nodes = Array.from(doc.childNodes)
  const rendered = nodes
    .map(node => renderNode(node, 0))
    .filter(line => line.length > 0)

  return rendered.join('\n') + '\n'
}
