import assert from 'node:assert/strict'
import test from 'node:test'

import { waysToGive } from '../src/app/giving.js'

/**
 * The addresses, checked against their own checksums.
 *
 * These are the one kind of string in this app where a mistake cannot be
 * corrected after the fact: money sent to a mistyped address is gone, and
 * nobody finds out until somebody tries. They were copied out of
 * Le-Space/landing's `DonateModal.svelte` by reading that file rather than by
 * retyping, and this is the second line of defence.
 *
 * **Two of the four are recomputed here in full.** bech32 and mod-97 are
 * arithmetic over the characters and need nothing but the characters. The other
 * two are checked for shape only, and the reason is written at each: EIP-55 and
 * Monero both hash with Keccak-256, which is *not* SHA3-256 and is not in
 * Node's crypto - verifying them properly would mean a dependency in an app
 * that has twenty-four of them, for a string that changes once a decade.
 */

const give = waysToGive()
const at = id => give.find(way => way.id === id)?.value

/** bech32 (BIP-173), the polymod over the human-readable part and the data. */
const bech32Valid = address => {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  const lower = address.toLowerCase()
  const split = lower.lastIndexOf('1')

  if (split < 1) return false

  const data = [...lower.slice(split + 1)].map(c => CHARSET.indexOf(c))

  if (data.some(d => d < 0)) return false

  const hrp = lower.slice(0, split)
  const values = [
    ...[...hrp].map(c => c.charCodeAt(0) >> 5),
    0,
    ...[...hrp].map(c => c.charCodeAt(0) & 31),
    ...data
  ]
  let checksum = 1

  for (const value of values) {
    const top = checksum >> 25

    checksum = ((checksum & 0x1ffffff) << 5) ^ value

    for (let i = 0; i < 5; i++) if ((top >> i) & 1) checksum ^= GENERATOR[i]
  }

  return checksum === 1
}

/** ISO 13616: move the first four characters to the end, letters become numbers, mod 97 must be 1. */
const ibanValid = iban => {
  const flat = iban.replace(/\s+/g, '').toUpperCase()
  const moved = flat.slice(4) + flat.slice(0, 4)
  const digits = [...moved].map(c => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('')
  let rest = 0

  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97

  return rest === 1
}

test('all four ways are offered, and each has something to copy', async () => {
  assert.deepEqual(give.map(way => way.id), ['btc', 'eth', 'xmr', 'iban'])

  for (const way of give) {
    assert.ok(way.value.length > 20, `${way.id} looks too short to be an address`)
    assert.equal(way.value, way.value.trim(), `${way.id} carries whitespace at an end`)
  }
})

test('the Bitcoin address passes its own bech32 checksum', async () => {
  // A single wrong character fails this, which is exactly what bech32 is for.
  assert.equal(bech32Valid(at('btc')), true, at('btc'))
  assert.ok(at('btc').startsWith('bc1'), 'mainnet, not testnet')
})

test('and a Bitcoin address with one character changed does not', async () => {
  // The check is only worth having if it can fail. `q` -> `p` in the data part.
  const broken = at('btc').replace('bc1q', 'bc1p')

  assert.equal(bech32Valid(broken), false, broken)
})

test('the IBAN passes mod-97', async () => {
  assert.equal(ibanValid(at('iban')), true, at('iban'))
  assert.ok(at('iban').startsWith('DE'), 'a German account, as the bank line says')
})

test('and an IBAN with two digits swapped does not', async () => {
  const flat = at('iban').replace(/\s+/g, '')
  const broken = flat.slice(0, 8) + flat[9] + flat[8] + flat.slice(10)

  assert.equal(ibanValid(broken), false, broken)
})

test('the Ethereum address has the shape of one', async () => {
  // Shape only. EIP-55's capitalisation is a Keccak-256 hash of the lowercase
  // address, and Keccak-256 is not SHA3-256 - Node cannot do it without a
  // dependency. What is checked: the prefix, the length, hex throughout, and
  // that it is not the all-lowercase form, which would mean the checksum
  // capitalisation was lost somewhere in the copying.
  const eth = at('eth')

  assert.match(eth, /^0x[0-9a-fA-F]{40}$/, eth)
  assert.notEqual(eth, eth.toLowerCase(), 'the EIP-55 capitalisation is gone')
})

test('the Monero address has the shape of one', async () => {
  // Shape only, and for the same reason: Monero's checksum is the first four
  // bytes of a Keccak-256. A standard address is 95 characters of base58 and
  // starts with 4.
  const xmr = at('xmr')

  assert.equal(xmr.length, 95, 'a standard Monero address is 95 characters')
  assert.ok(xmr.startsWith('4'), 'a standard address, not an integrated or subaddress')
  assert.match(xmr, /^[1-9A-HJ-NP-Za-km-z]+$/, 'base58 has no 0, O, I or l')
})
