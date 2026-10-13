import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import de from '../src/app/locales/de.js'
import en from '../src/app/locales/en.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const lookup = (catalogue, key) => key.split('.').reduce((node, part) => node?.[part], catalogue)

/**
 * Every key the app asks for, read off the source.
 *
 * `t()` returns a missing key as the key itself, on purpose: a visible
 * `files.empty` names its own bug. Somebody still has to see it first, and #60
 * shipped one that stood in the status line of every relayed connection for
 * weeks - its browser test matched /relay/i, and `link.connectedRelayed`
 * contains "Relayed". Reading the keys off the source fails before anybody has
 * to notice on a phone.
 *
 * Literal keys only: on lines that call `t(`, and in the markup's data-i18n
 * attributes. A key assembled at run time is not checked here.
 */
function usedKeys () {
  const sections = new Set(Object.keys(en))
  const keys = new Map()

  const add = (key, where) => {
    // A section name followed by a file name (`awake.js` in a comment) is not
    // a key.
    if (!sections.has(key.split('.')[0]) || /\.(js|css|html|json|md)$/.test(key)) return
    keys.set(key, [...(keys.get(key) ?? []), where])
  }

  const walk = dir => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

  for (const file of walk(join(root, 'src'))) {
    if (extname(file) !== '.js' || file.includes(`${sep}locales${sep}`)) continue

    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!/\bt\(/.test(line)) return
      for (const [, key] of line.matchAll(/['"`]([a-zA-Z]+(?:\.[a-zA-Z0-9_]+)+)['"`]/g)) {
        add(key, `${relative(root, file)}:${i + 1}`)
      }
    })
  }

  readFileSync(join(root, 'index.html'), 'utf8').split('\n').forEach((line, i) => {
    for (const [, value] of line.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) {
      for (const part of value.split(/[,;]/)) {
        add((part.includes(':') ? part.split(':')[1] : part).trim(), `index.html:${i + 1}`)
      }
    }
  })

  return keys
}

test('every key the app asks for has text in both languages', () => {
  const keys = usedKeys()
  const missing = [...keys].flatMap(([key, where]) =>
    [['en', en], ['de', de]]
      .filter(([, catalogue]) => lookup(catalogue, key) == null)
      .map(([locale]) => `${locale}: ${key} (${where[0]})`))

  // A scan that found next to nothing would pass for the wrong reason.
  assert.ok(keys.size > 100, `only ${keys.size} keys found - the scan is not reading the source`)
  assert.deepEqual(missing, [], `${keys.size} keys checked`)
})

/**
 * No key written twice in the same block.
 *
 * A duplicate in an object literal is legal JavaScript: the later one wins and
 * nothing anywhere complains. The check above cannot see it either - every
 * `data-i18n` still resolves to *a* string, just not the one somebody wrote.
 *
 * Found the hard way. A new `link.fold` was added for the connection fold,
 * `link.fold` already existed for "Oder als Link senden" twelve lines below,
 * and the new summary came out carrying the old sentence. On screen that is a
 * label that makes no sense in its place, which is the kind of thing a reader
 * blames themselves for.
 *
 * Read off the source rather than the parsed object, because by the time it is
 * parsed the evidence is gone.
 */
test('no catalogue writes the same key twice in one block', async () => {
  for (const file of ['src/app/locales/de.js', 'src/app/locales/en.js']) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n')
    /** @type {Array<{ indent: number, keys: Map<string, number> }>} */
    const open = []
    const twice = []

    lines.forEach((line, i) => {
      const key = line.match(/^(\s*)([A-Za-z_$][\w$]*)\s*:/)

      if (key == null) {
        // A block ends where a line closes one at a shallower indent.
        const shut = line.match(/^(\s*)[}\])]/)

        if (shut != null) {
          while (open.length > 0 && open[open.length - 1].indent >= shut[1].length) open.pop()
        }

        return
      }

      const indent = key[1].length

      while (open.length > 0 && open[open.length - 1].indent > indent) open.pop()

      if (open.length === 0 || open[open.length - 1].indent < indent) {
        open.push({ indent, keys: new Map() })
      }

      const here = open[open.length - 1].keys
      const before = here.get(key[2])

      if (before != null) twice.push(`${file}:${i + 1} ${key[2]} — also at line ${before}`)

      here.set(key[2], i + 1)
    })

    assert.deepEqual(twice, [], twice.join('\n'))
  }
})
