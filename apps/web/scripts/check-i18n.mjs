import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'rolldown/parseAst'

const root = new URL('../src/', import.meta.url)
const legalCopy = new Set(['screens/legal/DatenschutzScreen.tsx', 'screens/legal/ImpressumScreen.tsx'])
const textProps = new Set([
  'alt', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext',
  'title', 'placeholder', 'label', 'hint', 'legend', 'description', 'summary', 'emptyLabel',
  'backLabel', 'actionLabel', 'heading', 'searchLabel', 'message', 'eyebrow', 'caption',
  'loadingLabel', 'errorLabel', 'confirm', 'note', 'body',
])
// Measurement units and platform names have the same spelling in both locales.
const invariantText = /^(?:kcal|kg|cm|g|m|km|ml|g\/€|WhatsApp|Instagram)$/
const violations = []

function traverse(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) traverse(child, visit)
    return
  }
  if (node.type) visit(node)
  for (const child of Object.values(node)) {
    if (child && typeof child === 'object') traverse(child, visit)
  }
}

/** Check strings that can become the rendered value, including conditional and template text. */
function visibleStrings(node, report) {
  if (!node) return
  switch (node.type) {
    case 'JSXText':
    case 'Literal':
      if (typeof node.value === 'string') report(node, node.value)
      break
    case 'JSXExpressionContainer':
      visibleStrings(node.expression, report)
      break
    case 'TemplateLiteral':
      for (const part of node.quasis) report(part, part.value.cooked ?? part.value.raw)
      for (const expression of node.expressions) visibleStrings(expression, report)
      break
    case 'ConditionalExpression':
      visibleStrings(node.consequent, report)
      visibleStrings(node.alternate, report)
      break
    case 'LogicalExpression':
      if (node.operator !== '&&') visibleStrings(node.left, report)
      visibleStrings(node.right, report)
      break
    case 'BinaryExpression':
      if (node.operator === '+') {
        visibleStrings(node.left, report)
        visibleStrings(node.right, report)
      }
      break
  }
}

for (const file of readdirSync(root, { recursive: true }).sort()) {
  if (!file.endsWith('.tsx') || file.endsWith('.test.tsx') || legalCopy.has(file)) continue
  const url = new URL(file, root)
  const source = readFileSync(url, 'utf8')
  const ast = parseAst(source, { lang: 'tsx' }, fileURLToPath(url))
  const report = (node, value) => {
    const text = value.trim()
    if (!/\p{L}/u.test(text) || invariantText.test(text)) return
    const line = source.slice(0, node.start).split('\n').length
    violations.push(`${file}:${line}: move JSX copy into the i18n catalog (${JSON.stringify(text)})`)
  }
  traverse(ast, (node) => {
    if (node.type === 'JSXText' || node.type === 'JSXExpressionContainer') {
      // Expression containers in attributes are checked by name below.
      return
    }
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      for (const child of node.children) visibleStrings(child, report)
    } else if (node.type === 'JSXAttribute' && textProps.has(node.name.name)) {
      visibleStrings(node.value, report)
    }
  })
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exitCode = 1
}
