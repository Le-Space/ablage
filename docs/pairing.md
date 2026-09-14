# Pairing

**[Deutsch](pairing.de.md)** · English

## The short code is offered, and off

`@le-space/libp2p-webrtc-qr` can pack an invite the way
[QWBP](https://magarcia.github.io/qwbp/spec.html) does — about a quarter the
characters, so **one static code instead of an animated sequence**. It is here, in
every view, and **unticked by default**.

Not because it is unfinished: a connection built from a reconstructed SDP goes
silent under load — four of eight runs measured upstream against zero of eight on
the long format
([libp2p-webrtc-qr#83](https://github.com/NiKrause/libp2p-webrtc-qr/issues/83)).
For a folder sync, where load is the normal case rather than the exception, that
is the wrong default.

"Experimental" is on the label in every view, because that is a warning rather
than a detail — somebody who ticks it and then watches a transfer stall needs to
have been told. Which packing it uses, and how it differs from the thing it is
named after, follows the technical switch.

*Reading* is unconditional: this app accepts either format whatever the box says,
and answers in the format the invite arrived in. Ticking it only changes what
this device hands out. What travels is not wire-compatible with QWBP — the
packing is theirs, the signature over those bytes is ours.

## The camera is the one part nothing here covers

Every automated test hands a payload over as text, through the field in the
invite dialog. `getUserMedia` and the scanner element are exercised by hand
only — the container these tests run in has no camera, and answers
`Requested device not found` to anything that asks for one.

That is worth stating because the machine they are *written* on does have one.
A test that opens a camera passes on a laptop and fails every run on CI, which
happened twice before it was written down. `test/browser/handover.test.js` now
takes `getUserMedia` away in its own setup, so a local run asks the same
question the container does.

## Being present at the same time is a stage, not the design

With a direct QR connection and nothing else, both devices have to be present
and connectable at once. The interface has to say so from the first commit —
phrased as **not connected yet**, never as *this is what it does* — because
otherwise the first question is "why did my file not arrive".

Delivery when the two are apart is a later stage and its own decision. It is
what the name avoids committing to: `ablage` is the place the files are, and
says nothing about how far apart the devices holding it are.
