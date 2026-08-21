import assert from 'node:assert/strict'
import test from 'node:test'

import { denyDial, relayBootstrapList } from '../src/relay-policy.js'

const PEER = '/p2p/12D3KooWAX2ARgYnWjrAPHiM9hAXBvGUaQ9iK1PBNCV4FbMBRDVu'
const QR = '/webrtc/p2p/12D3KooWAX2ARgYnWjrAPHiM9hAXBvGUaQ9iK1PBNCV4FbMBRDVu'
const RELAY = `/dns4/relay.example/tcp/443/tls/ws${PEER}`

test('nobody asked, so nothing but a QR session may be dialed', () => {
  // The relay address is passed in on purpose. A test that left it out would
  // pass for the wrong reason and would keep passing with the gate deleted.
  assert.equal(denyDial(RELAY, false), true)
  assert.equal(denyDial(`${RELAY}/p2p-circuit${PEER}`, false), true)
  assert.equal(denyDial(QR, false), false)
})

test('a configured relay is not consent to use it', () => {
  assert.deepEqual(relayBootstrapList([RELAY], false), [])
  assert.deepEqual(relayBootstrapList([RELAY], true), [RELAY])
  // And consent without an address is nothing to dial.
  assert.deepEqual(relayBootstrapList([], true), [])
})

test('once asked, the relay and its circuits are dialable - and nothing else', () => {
  assert.equal(denyDial(RELAY, true), false)
  assert.equal(denyDial(`${RELAY}/p2p-circuit${PEER}`, true), false)

  assert.equal(denyDial(`/ip4/1.2.3.4/tcp/4001${PEER}`, true), true)
  assert.equal(denyDial(`/ip4/1.2.3.4/udp/4001/quic-v1${PEER}`, true), true)
})

test('plaintext websocket is denied where the browser would deny it anyway', () => {
  const plain = `/ip4/203.0.113.9/tcp/9092/ws${PEER}`

  assert.equal(denyDial(plain, true, 'https:'), true)
  // On http - local development, CI - the same address is fine.
  assert.equal(denyDial(plain, true, 'http:'), false)
})
