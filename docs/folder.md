# The folder

**[Deutsch](folder.de.md)** · English

## The private folder first, the real one second

Measured, not assumed:

| | `showDirectoryPicker` (host filesystem) | the origin's private folder |
| --- | --- | --- |
| Chromium | **yes** | yes |
| Firefox | no | yes |
| WebKit | no | yes |

So the foundation is the private folder, which every engine has, and picking a
real one is a Chromium bridge on top. Building on `showDirectoryPicker` would
have made two of three engines untestable from day one.

**It turned out to need no second storage at all.** Both a picked directory and
the private one are a `FileSystemDirectoryHandle`, and every call the store
makes is on that interface — so stage 3 added a second way to *get* a handle,
not a second way to use one. The module was renamed from `opfs.js` to
`directory.js`, because the old name described where the handle came from rather
than what the code did.

Which means the tests written against the private folder cover the picked one
too, for everything except the picking. That opens a native dialog and **no
browser automation can drive it** — unlike `<input type=file>`, which Playwright
can fill. It is verified by hand, and everything around it is verified here.

Two parts are easy to get wrong and are worth naming. A handle survives in
IndexedDB, but its **permission does not** — and asking again needs a user
gesture, so the app offers the remembered folder rather than demanding
permission on load. And there are **no change events** on a directory handle, in
any engine, so noticing an edit made in a text editor means polling. What is
polled is each file's size and modification time, not its contents: hashing a
folder on a timer is how a sync tool becomes the reason a laptop's fan runs.

## Offline, and installable

The data half never needed a network: the files are in OPFS or in the folder you
picked, and both are ordinary persistent storage. What was missing was the
**shell** — every load fetched the HTML and JS over HTTP, so a browser with no
connection had nothing to run and the local files were unreachable. A folder that
only opens when the internet is up is not a folder.

A service worker precaches the shell, generated at build time so it carries the
real hashed filenames — a hand-written list would be wrong the first time an
asset was renamed, and wrong *silently*, because the page would still load from
the network. Its version is a hash of what it caches rather than a timestamp:
a timestamp would change the worker on every build, which changes the site's
IPFS CID, and then a rebuild that altered nothing would look like a deployment.

**Two things about it are easy to get wrong and both were.**

Every path is relative, including the manifest link and the worker's own
registration. This site is served from `ablage.le-space.de` *and* from a gateway
under `/ipfs/<cid>/`, where a leading slash is the gateway's root — the same
mistake as `base: './'`, one layer down.

And the cache is read with `ignoreVary`. The precache is filled by the worker's
own requests, which carry no `Origin`; the page's request for the same module
carries one. Both vite preview and the Aleph gateway answer assets with
`Vary: Origin`, so a default match compares those headers, finds them different,
and reports a miss with the file sitting right there. Offline that is not a slow
path — it is a blank page: the shell loads from the navigation fallback and every
script fails. It cost a false-positive test to find, because every visible string
on the page is an English default in the markup, so a page whose JavaScript never
ran looks exactly like a working one.

Installable as well — manifest, a maskable icon, and the tags iOS wants because
it reads none of the manifest for them.
