export default {
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  // `experiments/` is a separate package with its own dependencies, kept for
  // reproducing the transport measurement. Vite's dependency scan would
  // otherwise try to resolve its imports against this package and fail loudly
  // about a gossipsub that was never meant to be installed here.
  optimizeDeps: { entries: ['index.html', 'harness.html'] },
  // `harness.html` is deliberately absent from the build. The dev server serves
  // any page in the root, which is what the browser tests use - and a published
  // site has no business shipping its own test rig.
  build: { rollupOptions: { input: { app: 'index.html' } } }
}
