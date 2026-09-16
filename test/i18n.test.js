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
