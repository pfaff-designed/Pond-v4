/* Make Noise glyphs — mask loader.
   CSS mask-image cannot reference a file URL in a sandboxed origin, so each
   glyph is fetched once and applied as a data-URI mask. The element keeps
   background: currentColor, so the glyph inherits colour like text.

   Plain HTML:  <script src="../assets/icons/icon-mask.js"></script>
                <span data-icon="star-01"></span>
                data-icon-base is optional — it defaults to this script's own
                directory, so the glyphs resolve from any page depth.
   React:       use the Icon component, which shares this cache. */
(function () {
  const cache = new Map()

  /* Default base: resolve against THIS script's own URL, so the loader works
     from any page depth. An origin-absolute '/assets/icons' never resolves —
     the sandbox serves the project under a path prefix. */
  const DEFAULT_BASE = (document.currentScript && document.currentScript.src)
    ? new URL('.', document.currentScript.src).href.replace(/\/$/, '')
    : 'assets/icons'

  function load(name, base) {
    const key = base + '/' + name
    if (!cache.has(key)) {
      cache.set(key, fetch(key + '.png')
        .then((r) => { if (!r.ok) throw new Error('icon 404: ' + key); return r.blob() })
        .then((b) => new Promise((res, rej) => {
          const fr = new FileReader()
          fr.onload = () => res(fr.result)
          fr.onerror = rej
          fr.readAsDataURL(b)
        }))
        .catch((e) => { console.warn(e); return null }))
    }
    return cache.get(key)
  }

  function paint(el, dataUri) {
    if (!dataUri) return
    const v = 'url("' + dataUri + '") no-repeat center / contain'
    el.style.webkitMask = v
    el.style.mask = v
  }

  function apply(el, name, base) {
    el.style.background = el.style.background || 'currentColor'
    return load(name, base).then((u) => paint(el, u))
  }

  function upgrade(root) {
    const els = (root || document).querySelectorAll('[data-icon]')
    return Promise.all([...els].map((el) =>
      apply(el, el.dataset.icon, el.dataset.iconBase || DEFAULT_BASE)))
  }

  window.MNIcons = { load, apply, upgrade }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => upgrade())
  else upgrade()
})()
