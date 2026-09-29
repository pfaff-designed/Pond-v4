/* @ds-bundle: {"format":4,"namespace":"MakeNoiseDesignSystem_e9e6de","components":[{"name":"Icon","sourcePath":"components/icon/Icon.jsx"},{"name":"ICONS","sourcePath":"components/icon/icons.js"},{"name":"NAMED_ICONS","sourcePath":"components/icon/icons.js"},{"name":"Card","sourcePath":"components/layout/Card.jsx"},{"name":"CardHeader","sourcePath":"components/layout/Card.jsx"},{"name":"CardBody","sourcePath":"components/layout/Card.jsx"},{"name":"CardFooter","sourcePath":"components/layout/Card.jsx"},{"name":"Image","sourcePath":"components/layout/Image.jsx"},{"name":"Avatar","sourcePath":"components/primitives/Avatar.jsx"},{"name":"Badge","sourcePath":"components/primitives/Badge.jsx"},{"name":"Button","sourcePath":"components/primitives/Button.jsx"},{"name":"Input","sourcePath":"components/primitives/Input.jsx"},{"name":"Label","sourcePath":"components/primitives/Label.jsx"},{"name":"Separator","sourcePath":"components/primitives/Separator.jsx"},{"name":"Eyebrow","sourcePath":"components/typography/Eyebrow.jsx"},{"name":"Link","sourcePath":"components/typography/Link.jsx"},{"name":"Text","sourcePath":"components/typography/Text.jsx"}],"sourceHashes":{"assets/icons/icon-mask.js":"1fabe83718fe","components/icon/Icon.jsx":"2c263db49c8b","components/icon/icons.js":"82e87aed6b71","components/layout/Card.jsx":"fe32452a6af0","components/layout/Image.jsx":"9337bf7a93bd","components/primitives/Avatar.jsx":"095ea702d650","components/primitives/Badge.jsx":"76397205d4cc","components/primitives/Button.jsx":"c1ba39d57276","components/primitives/Input.jsx":"bd668b64e8f1","components/primitives/Label.jsx":"c9c9a9e78715","components/primitives/Separator.jsx":"4c35ebc20099","components/typography/Eyebrow.jsx":"2baac83fb656","components/typography/Link.jsx":"2acb81bc91e6","components/typography/Text.jsx":"842646a6b1f0","ui_kits/make-noise-studio/Wordmark.jsx":"6ad5ae06cc19","ui_kits/make-noise-studio/app.jsx":"93b91863ce47","ui_kits/make-noise-studio/atoms.jsx":"ee427f00b169","ui_kits/make-noise-studio/chat.jsx":"ee2ecd60f1fb","ui_kits/make-noise-studio/chrome.jsx":"33d135b6a75c","ui_kits/pond/Document.jsx":"96d7b6567b04","ui_kits/pond/Rail.jsx":"c8d7607bb902","ui_kits/pond/Terminal.jsx":"e18a0c8a4978","ui_kits/pond/app.jsx":"c6e2303f1250","ui_kits/pond/data.js":"649c5ea9074c"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MakeNoiseDesignSystem_e9e6de = window.MakeNoiseDesignSystem_e9e6de || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/icons/icon-mask.js
try { (() => {
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
  const cache = new Map();

  /* Default base: resolve against THIS script's own URL, so the loader works
     from any page depth. An origin-absolute '/assets/icons' never resolves —
     the sandbox serves the project under a path prefix. */
  const DEFAULT_BASE = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src).href.replace(/\/$/, '') : 'assets/icons';
  function load(name, base) {
    const key = base + '/' + name;
    if (!cache.has(key)) {
      cache.set(key, fetch(key + '.png').then(r => {
        if (!r.ok) throw new Error('icon 404: ' + key);
        return r.blob();
      }).then(b => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(b);
      })).catch(e => {
        console.warn(e);
        return null;
      }));
    }
    return cache.get(key);
  }
  function paint(el, dataUri) {
    if (!dataUri) return;
    const v = 'url("' + dataUri + '") no-repeat center / contain';
    el.style.webkitMask = v;
    el.style.mask = v;
  }
  function apply(el, name, base) {
    el.style.background = el.style.background || 'currentColor';
    return load(name, base).then(u => paint(el, u));
  }
  function upgrade(root) {
    const els = (root || document).querySelectorAll('[data-icon]');
    return Promise.all([...els].map(el => apply(el, el.dataset.icon, el.dataset.iconBase || DEFAULT_BASE)));
  }
  window.MNIcons = {
    load,
    apply,
    upgrade
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => upgrade());else upgrade();
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/icons/icon-mask.js", error: String((e && e.message) || e) }); }

// components/icon/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const sizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32
};
const cache = new Map();

/** CSS mask-image cannot reference a file URL from a sandboxed origin, so each
 *  glyph is fetched once and applied as a data-URI mask. Shared across instances. */
function loadMask(name, base) {
  const key = base + '/' + name;
  if (!cache.has(key)) {
    cache.set(key, fetch(key + '.png').then(r => {
      if (!r.ok) throw new Error('icon 404: ' + key);
      return r.blob();
    }).then(b => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    })).catch(e => {
      console.warn(e);
      return null;
    }));
  }
  return cache.get(key);
}

/** A Make Noise glyph. Masked, not drawn — the PNG supplies the silhouette and
 *  the element supplies the colour, so every glyph inherits currentColor. */
const Icon = function Icon({
  name,
  size = 'md',
  base,
  label,
  style,
  ...props
}) {
  const px = typeof size === 'number' ? size : sizes[size];
  const globalBase = typeof window !== 'undefined' ? window.MN_ICON_BASE : null;
  const dir = base || globalBase || 'assets/icons';
  const [uri, setUri] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    loadMask(name, dir).then(u => {
      if (live) setUri(u);
    });
    return () => {
      live = false;
    };
  }, [name, dir]);
  const mask = uri ? `url("${uri}") no-repeat center / contain` : undefined;
  return /*#__PURE__*/React.createElement("span", _extends({
    role: label ? 'img' : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    style: {
      display: 'inline-block',
      flexShrink: 0,
      width: px,
      height: px,
      background: 'currentColor',
      WebkitMask: mask,
      mask,
      opacity: uri ? 1 : 0,
      transition: 'opacity var(--duration-fast) var(--ease-out)',
      ...style
    }
  }, props));
};
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/icon/icons.js
try { (() => {
/** The Make Noise glyph set — 182 solid geometric marks.
 *  Source: the studio's own Illustrator library, exported at 2x and normalized
 *  to a 192px square with 6% padding. Filled silhouettes, no strokes.
 *  Rendered through CSS mask, so every glyph inherits currentColor. */
const ICONS = ["abstract-shape", "arrow-02", "bird", "cake", "circle-02", "circle-in-square", "clover-01", "ears", "edge-01", "eye", "fat-flake", "flower-02", "flower-05", "flower-06", "grass", "heart", "house", "leaf-01", "lightning-03", "lightning-04", "meteor", "moon", "pacman", "peanut", "pill", "quadrant", "ramp", "ring", "rounded-stairs", "square-rounded-corner", "stairs-01", "stairs-02", "star-01", "star-02", "star-03", "sun", "tree-ellipsis", "triangle-01", "triangle-02", "tube", "tulip-01", "waves-02", "asset-1", "asset-2", "asset-3", "asset-4", "asset-6", "asset-7", "asset-8", "asset-9", "asset-10", "asset-11", "asset-12", "asset-13", "asset-14", "asset-15", "asset-16", "asset-17", "asset-18", "asset-19", "asset-20", "asset-21", "asset-22", "asset-23", "asset-24", "asset-25", "asset-26", "asset-27", "asset-28", "asset-29", "asset-30", "asset-31", "asset-32", "asset-33", "asset-34", "asset-35", "asset-36", "asset-37", "asset-39", "asset-41", "asset-42", "asset-43", "asset-44", "asset-45", "asset-46", "asset-47", "asset-48", "asset-49", "asset-50", "asset-51", "asset-52", "asset-53", "asset-54", "asset-55", "asset-56", "asset-57", "asset-58", "asset-59", "asset-60", "asset-61", "asset-62", "asset-63", "asset-65", "asset-66", "asset-67", "asset-68", "asset-69", "asset-71", "asset-72", "asset-73", "asset-74", "asset-78", "asset-80", "asset-83", "asset-86", "asset-87", "asset-88", "asset-90", "asset-91", "asset-92", "asset-93", "asset-94", "asset-95", "asset-99", "asset-100", "asset-101", "asset-103", "asset-104", "asset-105", "asset-106", "asset-107", "asset-108", "asset-109", "asset-110", "asset-112", "asset-113", "asset-115", "asset-116", "asset-117", "asset-118", "asset-119", "asset-120", "asset-121", "asset-122", "asset-123", "asset-124", "asset-125", "asset-126", "asset-127", "asset-128", "asset-129", "asset-130", "asset-131", "asset-132", "asset-133", "asset-134", "asset-135", "asset-136", "asset-137", "asset-138", "asset-139", "asset-140", "asset-141", "asset-142", "asset-143", "asset-144", "asset-145", "asset-146", "asset-147", "asset-148", "asset-149", "asset-150", "asset-151", "asset-152", "asset-153", "asset-154", "asset-155", "asset-156", "asset-158", "asset-159", "asset-160", "asset-161"];

/** Glyphs with a descriptive name. The rest are numbered library shapes. */
const NAMED_ICONS = ["abstract-shape", "arrow-02", "bird", "cake", "circle-02", "circle-in-square", "clover-01", "ears", "edge-01", "eye", "fat-flake", "flower-02", "flower-05", "flower-06", "grass", "heart", "house", "leaf-01", "lightning-03", "lightning-04", "meteor", "moon", "pacman", "peanut", "pill", "quadrant", "ramp", "ring", "rounded-stairs", "square-rounded-corner", "stairs-01", "stairs-02", "star-01", "star-02", "star-03", "sun", "tree-ellipsis", "triangle-01", "triangle-02", "tube", "tulip-01", "waves-02"];
Object.assign(__ds_scope, { ICONS, NAMED_ICONS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icon/icons.js", error: String((e && e.message) || e) }); }

// components/layout/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const pads = {
  none: 0,
  sm: 'var(--space-4)',
  md: 'var(--space-5)',
  lg: 'var(--space-6)'
};

/** A bordered surface. Shadow is opt-in — the resting card is a hairline, not a float. */
function Card({
  padding = 'md',
  elevated = false,
  shadow = false,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: 'var(--radius-lg)',
      border: '1px solid',
      background: elevated ? 'var(--color-bg-elevated-dark)' : 'var(--color-bg-page)',
      borderColor: elevated ? 'transparent' : 'var(--color-border-subtle)',
      color: elevated ? 'var(--color-paper)' : 'var(--color-text-primary)',
      boxShadow: shadow ? 'var(--shadow-md)' : 'none',
      padding: pads[padding],
      ...style
    }
  }, props));
}
function CardHeader({
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      paddingBottom: 'var(--space-4)',
      ...style
    }
  }, props));
}
function CardBody({
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontSize: 'var(--text-base)',
      lineHeight: 'var(--leading-normal)',
      ...style
    }
  }, props));
}
function CardFooter({
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      paddingTop: 'var(--space-4)',
      borderTop: '1px solid var(--color-border-subtle)',
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Card, CardHeader, CardBody, CardFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Card.jsx", error: String((e && e.message) || e) }); }

// components/layout/Image.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ratios = {
  '1/1': '1 / 1',
  '4/3': '4 / 3',
  '16/9': '16 / 9',
  '3/2': '3 / 2',
  '2/3': '2 / 3'
};

/** Image with an optional locked aspect ratio. */
function Image({
  aspectRatio,
  alt = '',
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("img", _extends({
    alt: alt,
    style: {
      display: 'block',
      maxWidth: '100%',
      ...(aspectRatio ? {
        width: '100%',
        objectFit: 'cover',
        aspectRatio: ratios[aspectRatio]
      } : null),
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Image });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Image.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Avatar.jsx
try { (() => {
const sizes = {
  sm: {
    w: 32,
    f: 'var(--text-xs)'
  },
  md: {
    w: 40,
    f: 'var(--text-sm)'
  },
  lg: {
    w: 56,
    f: 'var(--text-base)'
  }
};

/** Circular identity mark; falls back to initials on the subtle surface. */
function Avatar({
  src,
  alt = '',
  fallback,
  size = 'md',
  style
}) {
  const s = sizes[size];
  const [broken, setBroken] = React.useState(false);
  const initials = fallback ?? (alt ? alt.slice(0, 2).toUpperCase() : '??');
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      overflow: 'hidden',
      borderRadius: 'var(--radius-full)',
      width: s.w,
      height: s.w,
      fontSize: s.f,
      background: 'var(--color-bg-subtle)',
      border: '1px solid var(--color-border-subtle)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-wide)',
      color: 'var(--color-text-secondary)',
      ...style
    }
  }, src && !broken ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt,
    onError: () => setBroken(true),
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const variants = {
  /* Burnt orange carries INK at 4.77:1. Red grounds fail AA for 11px text, so
     the default badge is never red-on-paper. */
  default: {
    background: 'var(--raw-burnt-orange)',
    color: 'var(--raw-ink)',
    borderColor: 'transparent'
  },
  outline: {
    background: 'transparent',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-border-default)'
  },
  success: {
    background: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderColor: 'transparent'
  },
  warning: {
    background: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    borderColor: 'transparent'
  },
  error: {
    background: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    borderColor: 'transparent'
  }
};

/** Badges and tags are the one place a warm signal may repeat freely. */
function Badge({
  variant = 'default',
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      textTransform: 'uppercase',
      fontSize: 'var(--text-xs)',
      letterSpacing: 'var(--tracking-wider)',
      lineHeight: 1,
      padding: 'var(--space-2)',
      paddingTop: 'var(--space-1)',
      paddingBottom: 'var(--space-1)',
      borderRadius: 'var(--radius-full)',
      border: '1px solid',
      ...variants[variant],
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Badge.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const base = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  letterSpacing: 'var(--tracking-wide)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid transparent',
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: 1,
  transition: 'opacity var(--duration-base) var(--ease-out), background-color var(--duration-fast) var(--ease-out)'
};
const variants = {
  primary: {
    background: 'var(--color-cta-bg)',
    color: 'var(--color-cta-text)'
  },
  secondary: {
    background: 'var(--color-cta-secondary-bg)',
    color: 'var(--color-cta-secondary-text)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-border-default)'
  }
};
const sizes = {
  sm: {
    fontSize: 'var(--text-xs)',
    padding: 'var(--space-2) var(--space-4)'
  },
  md: {
    fontSize: 'var(--text-sm)',
    padding: 'var(--space-3) var(--space-5)'
  },
  lg: {
    fontSize: 'var(--text-base)',
    padding: 'var(--space-4) var(--space-6)'
  }
};

/** Primary CTA is always ink on paper (paper on ink in dark). Accent never touches a primary action. */
function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: e => {
      setHover(true);
      onMouseEnter?.(e);
    },
    onMouseLeave: e => {
      setHover(false);
      onMouseLeave?.(e);
    },
    style: {
      ...base,
      ...variants[variant],
      ...sizes[size],
      opacity: disabled ? 0.4 : hover ? 0.9 : 1,
      background: hover && variant === 'ghost' ? 'var(--color-bg-subtle)' : variants[variant].background,
      pointerEvents: disabled ? 'none' : undefined,
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Button.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Text field. Focus ring is calm; error state uses the deep crimson error color, never accent. */
function Input({
  error = false,
  style,
  ...props
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({
    onFocus: e => {
      setFocus(true);
      props.onFocus?.(e);
    },
    onBlur: e => {
      setFocus(false);
      props.onBlur?.(e);
    },
    style: {
      display: 'block',
      width: '100%',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-base)',
      color: 'var(--color-text-primary)',
      lineHeight: 'var(--leading-normal)',
      background: 'var(--color-bg-page)',
      border: '1px solid ' + (error ? 'var(--color-error)' : 'var(--color-border-default)'),
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)',
      outline: focus ? '2px solid ' + (error ? 'var(--color-error)' : 'var(--color-calm)') : 'none',
      outlineOffset: '1px',
      transition: 'border-color var(--duration-fast) var(--ease-out)',
      opacity: props.disabled ? 0.4 : 1,
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Input.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Label.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Always uppercase, always small. Never at body scale or larger. */
function Label({
  bold = false,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      fontFamily: 'var(--font-sans)',
      textTransform: 'uppercase',
      lineHeight: 'var(--leading-normal)',
      fontSize: 'var(--text-xs)',
      color: 'var(--color-text-primary)',
      fontWeight: bold ? 700 : 500,
      letterSpacing: bold ? 'var(--tracking-wider)' : 'var(--tracking-wide)',
      cursor: 'default',
      display: 'inline-block',
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Label });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Label.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Separator.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** A hairline rule in the subtle border tone. */
function Separator({
  orientation = 'horizontal',
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "separator",
    "aria-orientation": orientation,
    style: {
      flexShrink: 0,
      background: 'var(--color-border-subtle)',
      height: orientation === 'horizontal' ? 1 : '100%',
      width: orientation === 'horizontal' ? '100%' : 1,
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Separator });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Separator.jsx", error: String((e && e.message) || e) }); }

// components/typography/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The uppercase kicker above a section heading. */
function Eyebrow({
  accent = false,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement("p", _extends({
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      textTransform: 'uppercase',
      fontSize: 'var(--text-xs)',
      letterSpacing: 'var(--tracking-wider)',
      lineHeight: 'var(--leading-normal)',
      color: accent ? 'var(--color-accent)' : 'var(--color-text-secondary)',
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/typography/Link.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Reads --color-link (accent at the root, the spine blue inside .theme-press);
 *  subtle for in-flow secondary links. */
function Link({
  external = false,
  subtle = false,
  style,
  children,
  ...props
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", _extends({}, external ? {
    target: '_blank',
    rel: 'noopener noreferrer'
  } : {}, {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 400,
      lineHeight: 'var(--leading-normal)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
      transition: 'opacity var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
      color: subtle ? hover ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' : 'var(--color-link)',
      opacity: !subtle && hover ? 0.75 : 1,
      ...style
    }
  }, props), children);
}
Object.assign(__ds_scope, { Link });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/Link.jsx", error: String((e && e.message) || e) }); }

// components/typography/Text.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const voices = {
  'body': {
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    fontStyle: 'normal',
    textTransform: 'none',
    letterSpacing: 'var(--tracking-normal)',
    lineHeight: 'var(--leading-normal)'
  },
  'label': {
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    fontStyle: 'normal',
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wide)',
    lineHeight: 'var(--leading-normal)'
  },
  'label-bold': {
    fontFamily: 'var(--font-sans)',
    fontWeight: 700,
    fontStyle: 'normal',
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wider)',
    lineHeight: 'var(--leading-normal)'
  },
  'mono': {
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    fontStyle: 'normal',
    textTransform: 'none',
    letterSpacing: 'var(--tracking-normal)',
    lineHeight: 'var(--leading-normal)'
  },
  'whisper': {
    fontFamily: 'var(--font-display)',
    fontWeight: 200,
    fontStyle: 'normal',
    letterSpacing: 'var(--tracking-tight)',
    lineHeight: 'var(--leading-tight)'
  },
  'whisper-italic': {
    fontFamily: 'var(--font-display)',
    fontWeight: 200,
    fontStyle: 'italic',
    letterSpacing: 'var(--tracking-tight)',
    lineHeight: 'var(--leading-tight)'
  },
  'punch': {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontStyle: 'normal',
    letterSpacing: 'var(--tracking-tight)',
    lineHeight: 'var(--leading-tight)'
  },
  'punch-italic': {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontStyle: 'italic',
    letterSpacing: 'var(--tracking-tight)',
    lineHeight: 'var(--leading-tight)'
  }
};
const sizes = {
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  base: 'var(--text-base)',
  lg: 'var(--text-lg)',
  xl: 'var(--text-xl)',
  '2xl': 'var(--text-2xl)',
  '3xl': 'var(--text-3xl)',
  '4xl': 'var(--text-4xl)',
  'display-punch': 'var(--text-display-punch)',
  'display-whisper': 'var(--text-display-whisper)',
  'display-hero': 'var(--text-display-hero)'
};

/** The voice system as a component. Display voices are for statements only. */
function Text({
  as: Tag = 'p',
  voice = 'body',
  size = 'base',
  muted = false,
  style,
  ...props
}) {
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      ...voices[voice],
      fontSize: sizes[size],
      color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
      ...style
    }
  }, props));
}
Object.assign(__ds_scope, { Text });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typography/Text.jsx", error: String((e && e.message) || e) }); }

// ui_kits/make-noise-studio/Wordmark.jsx
try { (() => {
/** The Make Noise wordmark, inlined so it inherits currentColor.
 *  Source of truth: assets/logo/make-noise-wordmark.svg */
function Wordmark({
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 30 1560.15 190",
    fill: "currentColor",
    role: "img",
    "aria-label": "Make Noise",
    className: className,
    style: {
      width: '100%',
      height: 'auto',
      display: 'block',
      ...style
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M37.42,35.62h54.5l13.75,118.5h.5l58.5-118.5h56.75l-34.75,178.75h-42l21.5-111.25h-1l-55.25,111.25h-30.5l-12.25-111.25h-1l-21.5,111.25H2.67L37.42,35.62Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M301.42,35.62h45.75l32,178.75h-46.75l-4.25-37.25h-61.25l-18.75,37.25h-46.5l99.75-178.75ZM324.92,142.87l-7.5-66h-.5l-33,66h41Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M427.92,35.62h45l-14,72.5,76.75-72.5h50.25l-82.5,77.75,54.5,101h-52.5l-35-69.75-22.75,21.5-9.5,48.25h-45l34.75-178.75Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M601.66,35.62h135.5l-7.25,36.75h-90.5l-6,31.75h78l-7.25,36.75h-78l-7,36.75h92l-7.25,36.75h-137l34.75-178.75Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M809.66,35.62h44.5l41.75,106.25h1l20.75-106.25h45l-34.75,178.75h-44.5l-41.75-106.25h-1l-20.75,106.25h-45l34.75-178.75Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M987.03,198.25c-13.59-13.41-20.38-31.79-20.38-55.12,0-20.5,4.12-39.25,12.38-56.25s20.08-30.46,35.5-40.38c15.41-9.91,33.46-14.88,54.12-14.88,16.5,0,30.62,3.04,42.38,9.12,11.75,6.09,20.66,14.75,26.75,26,6.08,11.25,9.12,24.54,9.12,39.88,0,20.34-4.12,39-12.38,56s-20.12,30.54-35.62,40.62c-15.5,10.09-33.67,15.12-54.5,15.12-24.67,0-43.79-6.71-57.38-20.12ZM1020.53,171.12c5.91,7,14.54,10.5,25.88,10.5s21.71-3.54,30.12-10.62c8.41-7.08,14.75-16.25,19-27.5s6.38-23.12,6.38-35.62-2.96-22-8.88-29c-5.92-7-14.46-10.5-25.62-10.5s-21.71,3.54-30.12,10.62c-8.42,7.09-14.79,16.29-19.12,27.62-4.34,11.34-6.5,23.25-6.5,35.75s2.96,21.75,8.88,28.75Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M1185.66,35.62h45l-34.75,178.75h-45l34.75-178.75Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M1260.9,210.62c-11.34-5.16-19.88-12.58-25.62-22.25-5.75-9.66-8.38-21-7.88-34h45.5c-.5,2.17-.75,4.34-.75,6.5,0,7,2.75,12.29,8.25,15.88,5.5,3.59,12.83,5.38,22,5.38,9.66,0,17.12-1.75,22.38-5.25s7.88-8,7.88-13.5c0-3.66-1.17-6.75-3.5-9.25-2.34-2.5-5.5-4.62-9.5-6.38s-10.17-4.12-18.5-7.12c-2.34-.66-4.09-1.25-5.25-1.75-11.17-3.83-20.34-7.83-27.5-12-7.17-4.16-12.84-9.38-17-15.62-4.17-6.25-6.25-14.04-6.25-23.38,0-11.5,3.16-21.5,9.5-30,6.33-8.5,15.12-15,26.38-19.5s24.21-6.75,38.88-6.75c22.66,0,39.83,5.17,51.5,15.5,11.66,10.34,17.66,24.59,18,42.75h-44.75c.66-7.5-1.38-13.16-6.12-17-4.75-3.83-11.88-5.75-21.38-5.75-8,0-14.29,1.42-18.88,4.25-4.59,2.84-6.88,6.92-6.88,12.25,0,3.5,1.04,6.42,3.12,8.75,2.08,2.34,5,4.42,8.75,6.25,3.75,1.84,9.62,4.25,17.62,7.25,14.33,5.5,25.25,10.12,32.75,13.88s13.66,8.79,18.5,15.12c4.83,6.34,7.25,14.42,7.25,24.25,0,11.17-2.96,21.25-8.88,30.25-5.92,9-14.71,16.09-26.38,21.25-11.67,5.16-25.84,7.75-42.5,7.75s-29.42-2.59-40.75-7.75Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M1424.65,35.62h135.5l-7.25,36.75h-90.5l-6,31.75h78l-7.25,36.75h-78l-7,36.75h92l-7.25,36.75h-137l34.75-178.75Z"
  }));
}
window.Wordmark = Wordmark;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/make-noise-studio/Wordmark.jsx", error: String((e && e.message) || e) }); }

// ui_kits/make-noise-studio/app.jsx
try { (() => {
const CONTACT_INFO = 'email — hi@make-noise.studio\nphone — 703-909-5197';

/** Canned replies, written in the studio's own voice (short, prose, no bullets). */
const REPLIES = {
  'What do you do?': "We build the place where your customers actually meet your AI. Site agents that learn a brand and surface real leads, copywriter agents that draft and measure, consultant agents that keep institutional memory. Design systems built to the same standard as the AI layer. What are you working on?",
  'What have you done?': "Charles came out of agency work — Capital One, Coca-Cola, Delta, PMI, Tanger, Sony. Make Noise itself started in 2025. This site is the proof: an agent built on a documented design process, running live. What's the thing you're trying to ship?",
  'Who are you?': "I'm MN, the front door to Make Noise — a design and technology studio in Richmond, VA, founded by Charles Pfaff. Designer, marketer, technologist. Dry sense of humor. Takes craft seriously, not himself. What brought you here?",
  '/contact': CONTACT_INFO
};
const DEFAULT_REPLY = "AI isn't about efficiency. It's a tool that extends your ability to think — an unopinionated mirror. Tell me what you're working on and why, and I'll tell you whether we're the right people for it.";
function App() {
  const [mode, setMode] = React.useState('intro');
  const [messages, setMessages] = React.useState([]);
  const [streaming, setStreaming] = React.useState(false);
  const [composerHidden, setComposerHidden] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [chromeOff, setChromeOff] = React.useState(false);
  const [overlaysReady, setOverlaysReady] = React.useState(false);
  const stageRef = React.useRef(null);
  const [chatSize, setChatSize] = React.useState({
    width: 420,
    height: 525
  });
  const sizeChat = () => {
    const r = stageRef.current?.getBoundingClientRect();
    const w = Math.min((r?.width ?? 900) * 0.42, 460);
    setChatSize({
      width: w,
      height: Math.min(w * 1.25, (r?.height ?? 700) - 80)
    });
  };
  const reply = q => REPLIES[q] ?? DEFAULT_REPLY;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const handleSubmit = async text => {
    if (streaming) return;
    setStreaming(true);
    setComposerHidden(true);
    const first = messages.length === 0;
    if (first) {
      sizeChat();
      setChromeOff(true);
      await wait(700);
      setMode('chat');
      await wait(400);
      setMessages([{
        role: 'user',
        content: text
      }]);
      await wait(1300);
      setMessages([{
        role: 'user',
        content: text
      }, {
        role: 'assistant',
        content: reply(text)
      }]);
      await wait(900);
      setRevealed(true);
      setOverlaysReady(true);
      setComposerHidden(false);
    } else {
      setMessages(p => [...p, {
        role: 'user',
        content: text
      }]);
      await wait(900);
      setMessages(p => [...p, {
        role: 'assistant',
        content: reply(text)
      }]);
      setComposerHidden(false);
    }
    setStreaming(false);
  };
  const handleReset = () => {
    setMode('intro');
    setMessages([]);
    setStreaming(false);
    setComposerHidden(false);
    setRevealed(false);
    setChromeOff(false);
    setOverlaysReady(false);
  };
  const slide = 'transform 1.1s cubic-bezier(.65,0,.35,1), opacity 350ms cubic-bezier(.4,0,.2,1)';
  return /*#__PURE__*/React.createElement("div", {
    ref: stageRef,
    className: "theme-studio",
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--raw-ink)',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(AsciiStage, {
    dissolved: mode === 'chat'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 24,
      zIndex: 20,
      background: 'var(--raw-paper)',
      transform: chromeOff ? 'translateX(-110%)' : 'none',
      transition: slide
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      width: 24,
      zIndex: 20,
      background: 'var(--raw-paper)',
      transform: chromeOff ? 'translateX(110%)' : 'none',
      transition: slide
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      padding: '0 24px',
      zIndex: 20,
      background: 'var(--raw-paper)',
      transform: chromeOff ? 'translateY(-110%)' : 'none',
      transition: slide
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      opacity: chromeOff ? 0 : 1,
      transition: 'opacity 350ms'
    }
  }, /*#__PURE__*/React.createElement(SiteHeader, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '0 24px',
      zIndex: 20,
      background: 'var(--raw-paper)',
      transform: chromeOff ? 'translateY(110%)' : 'none',
      transition: slide
    }
  }, /*#__PURE__*/React.createElement(SiteFooter, {
    onNavigate: handleSubmit,
    onContact: () => handleSubmit('/contact')
  })), mode === 'intro' && /*#__PURE__*/React.createElement(SiteComposer, {
    hidden: composerHidden,
    streaming: streaming,
    onSubmit: handleSubmit
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
      opacity: mode === 'chat' ? 1 : 0,
      visibility: mode === 'chat' ? 'visible' : 'hidden',
      pointerEvents: mode === 'chat' ? 'auto' : 'none',
      transition: 'opacity 450ms cubic-bezier(.16,1,.3,1)'
    }
  }, /*#__PURE__*/React.createElement(ChatInterface, {
    width: chatSize.width,
    height: chatSize.height,
    messages: messages,
    streaming: streaming,
    revealed: revealed,
    onSubmit: handleSubmit
  })), overlaysReady && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: 'fade-in 520ms cubic-bezier(.16,1,.3,1) both'
    }
  }, /*#__PURE__*/React.createElement(SiteHeaderPill, {
    onReset: handleReset
  }), /*#__PURE__*/React.createElement(SiteFooter, {
    overlay: true,
    onNavigate: handleSubmit,
    onContact: () => handleSubmit('/contact')
  })), /*#__PURE__*/React.createElement(NoiseOverlay, null));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/make-noise-studio/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/make-noise-studio/atoms.jsx
try { (() => {
const SCRAMBLE_CHARS = 'MAKE NOISE ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·—';
const SCRAMBLE_MS = 1500;

/** Character-scramble reveal — Fisher-Yates resolution order over 1500ms.
 *  Recreated from make-noise-site components/atoms/ScrambleText. */
function ScrambleText({
  children,
  className,
  style
}) {
  const toText = n => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(toText).join('') : React.isValidElement(n) ? toText(n.props.children) : '';
  const text = toText(children);
  const [display, setDisplay] = React.useState(() => text.split('').map(ch => ch === ' ' ? ' ' : SCRAMBLE_CHARS[Math.random() * SCRAMBLE_CHARS.length | 0]).join(''));
  React.useEffect(() => {
    const idx = text.split('').map((_, i) => i).filter(i => text[i] !== ' ');
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.random() * (i + 1) | 0;
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    let start = -1,
      raf = 0;
    const tick = now => {
      if (start < 0) start = now;
      const p = Math.min((now - start) / SCRAMBLE_MS, 1);
      const resolved = new Set(idx.slice(0, Math.floor(p * idx.length)));
      setDisplay(text.split('').map((ch, i) => ch === ' ' ? ' ' : resolved.has(i) ? ch : SCRAMBLE_CHARS[Math.random() * SCRAMBLE_CHARS.length | 0]).join(''));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: style
  }, display);
}

/** Full-viewport film grain: per-pixel noise at ~10fps, screen blend, alpha 0.036. */
function NoiseOverlay() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let off,
      offCtx,
      data,
      buf,
      raf = 0,
      last = 0;
    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      const cw = Math.round(r.width),
        ch = Math.round(r.height);
      if (!cw || !ch) return;
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      off = document.createElement('canvas');
      off.width = cw;
      off.height = ch;
      offCtx = off.getContext('2d');
      data = new ImageData(cw, ch);
      buf = new Uint32Array(data.data.buffer);
    };
    const draw = now => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100 || !buf) return;
      last = now;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.random() * 256 | 0;
        buf[i] = 255 << 24 | v << 16 | v << 8 | v;
      }
      offCtx.putImageData(data, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.036;
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
    };
    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return /*#__PURE__*/React.createElement("canvas", {
    ref: ref,
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 9999,
      mixBlendMode: 'screen'
    }
  });
}

/** The live ASCII field — a flow-field character grid, the site's resting background. */
function AsciiStage({
  dissolved
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const CH = 'MAKENOISE·—/ ';
    let raf = 0,
      t = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      t += 0.012;
      const r = el.parentElement.getBoundingClientRect();
      const cols = Math.max(20, Math.floor(r.width / 7.6));
      const rows = Math.max(10, Math.floor(r.height / 13));
      let out = '';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = Math.sin(x * 0.11 + t) + Math.cos(y * 0.17 - t * 0.7) + Math.sin((x + y) * 0.05 + t * 1.3);
          const n = Math.floor((v + 3) / 6 * CH.length);
          out += Math.random() > 0.988 ? CH[Math.random() * CH.length | 0] : CH[Math.min(CH.length - 1, Math.max(0, n))];
        }
        out += '\n';
      }
      el.textContent = out;
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);
  return /*#__PURE__*/React.createElement("pre", {
    ref: ref,
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 0,
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      lineHeight: '13px',
      letterSpacing: '0.04em',
      color: 'var(--raw-paper)',
      opacity: dissolved ? 0.06 : 0.3,
      transition: 'opacity 1.2s cubic-bezier(.4,0,.2,1)',
      userSelect: 'none',
      whiteSpace: 'pre'
    }
  });
}
Object.assign(window, {
  ScrambleText,
  NoiseOverlay,
  AsciiStage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/make-noise-studio/atoms.jsx", error: String((e && e.message) || e) }); }

// ui_kits/make-noise-studio/chat.jsx
try { (() => {
const COMMAND_SECTIONS = [{
  header: "what's your business?",
  commands: [{
    id: 'brain-storm',
    label: '/brain-storm',
    description: 'rfp brainstorm'
  }, {
    id: 'contact',
    label: '/contact',
    description: 'get in touch'
  }, {
    id: 'what-do-you-do',
    label: '/what-do-you-do?',
    description: 'services'
  }, {
    id: 'who-are-you',
    label: '/who-are-you?',
    description: 'about'
  }, {
    id: 'what-have-you-done',
    label: '/what-have-you-done?',
    description: 'past work'
  }, {
    id: 'peu',
    label: '/peu',
    description: 'pfaff extended universe'
  }, {
    id: 'free-stuff',
    label: '/free-stuff',
    description: 'free tools & resources'
  }]
}, {
  header: "what's your pleasure?",
  commands: [{
    id: 'make-noise',
    label: '/make some noise',
    description: 'orca module'
  }, {
    id: 'play-game',
    label: '/do you want to play a game?',
    description: 'arcade'
  }]
}, {
  header: 'curiosities & other tinkerable things',
  commands: [{
    id: 'talk-to-me',
    label: '/talk to me',
    description: 'conversation'
  }, {
    id: 'ambient-animation',
    label: '/ambient-animation',
    description: 'change background'
  }, {
    id: 'theme',
    label: '/theme',
    description: 'change colors'
  }]
}];
function CommandPicker({
  query,
  onSelect
}) {
  const q = query.toLowerCase();
  const sections = COMMAND_SECTIONS.map(s => ({
    ...s,
    commands: s.commands.filter(c => c.label.toLowerCase().includes(q) || c.description.includes(q))
  })).filter(s => s.commands.length);
  if (!sections.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 4,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '0.04em',
      maxHeight: 170,
      overflowY: 'auto'
    }
  }, sections.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.header,
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--studio-yellow)',
      opacity: 0.55,
      padding: '4px 0'
    }
  }, s.header), s.commands.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    onClick: () => onSelect(c),
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      textAlign: 'left',
      color: 'var(--raw-paper)',
      padding: '3px 0',
      fontFamily: 'inherit',
      fontSize: 'inherit'
    },
    onMouseEnter: e => {
      e.currentTarget.style.color = 'var(--studio-yellow)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.color = 'var(--raw-paper)';
    }
  }, /*#__PURE__*/React.createElement("span", null, c.label), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.45
    }
  }, c.description))))));
}
function ComposerCursor({
  hidden
}) {
  if (hidden) return null;
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      flex: 'none',
      userSelect: 'none',
      color: 'var(--studio-yellow)',
      animation: 'composer-cursor-blink 1s step-end infinite'
    }
  }, "|");
}

/** The intro composer — a bare mono prompt on an ink backdrop, centered in the stage. */
function SiteComposer({
  hidden,
  streaming,
  onSubmit
}) {
  const [value, setValue] = React.useState('');
  const [active, setActive] = React.useState(false);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (!hidden) inputRef.current?.focus();
  }, [hidden]);
  const submit = () => {
    if (streaming) return;
    const t = value.trim() || "let's make some noise";
    setValue('');
    onSubmit(t);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 10,
      maxWidth: 'min(90%,640px)',
      opacity: hidden ? 0 : 1,
      pointerEvents: hidden ? 'none' : 'auto',
      transition: 'opacity 280ms cubic-bezier(.4,0,.2,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 'max-content',
      maxWidth: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: '-14px -22px',
      background: 'var(--raw-ink)',
      zIndex: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.75rem',
      letterSpacing: '0.04em',
      color: 'var(--studio-yellow)',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      flex: 'none',
      userSelect: 'none',
      whiteSpace: 'pre'
    }
  }, "> "), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      visibility: 'hidden',
      whiteSpace: 'pre',
      font: 'inherit'
    }
  }, value || (active ? ' ' : "let's make some noise")), !value && !active && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 0,
      whiteSpace: 'pre',
      font: 'inherit'
    }
  }, "let's make some noise"), /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    type: "text",
    value: value,
    disabled: streaming,
    spellCheck: false,
    autoComplete: "off",
    "aria-label": "let's make some noise",
    onChange: e => setValue(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    },
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      font: 'inherit',
      color: 'var(--studio-yellow)',
      padding: 0,
      caretColor: active ? 'var(--studio-yellow)' : 'transparent'
    }
  }), /*#__PURE__*/React.createElement(ComposerCursor, {
    hidden: active || value.length > 0
  })))));
}

/** The chat panel — an ink rectangle floating over the dissolved ASCII field. */
function ChatInterface({
  width,
  height,
  messages,
  streaming,
  revealed,
  onSubmit
}) {
  const [value, setValue] = React.useState('');
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);
  const pickerOpen = value.startsWith('/') && revealed;
  const submit = () => {
    if (streaming || pickerOpen) return;
    const t = value.trim() || "let's make some noise";
    setValue('');
    onSubmit(t);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      background: 'var(--raw-ink)',
      display: 'flex',
      flexDirection: 'column',
      width,
      height,
      padding: 24,
      pointerEvents: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: scrollRef,
    className: "chat-history-scroll",
    style: {
      position: 'absolute',
      inset: 0,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, messages.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      lineHeight: 1.2,
      letterSpacing: '0.04em',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      color: 'var(--raw-paper)'
    }
  }, /*#__PURE__*/React.createElement(ScrambleText, null, (m.role === 'user' ? 'you: ' : 'mn: ') + m.content))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      opacity: revealed ? 1 : 0,
      transition: 'opacity 600ms cubic-bezier(.16,1,.3,1)',
      pointerEvents: revealed ? 'auto' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '0.1em',
      textTransform: 'lowercase',
      color: 'var(--raw-paper)',
      opacity: 0.45,
      padding: '10px 0 6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: 'var(--studio-yellow)'
    }
  }), /*#__PURE__*/React.createElement("span", null, "hold ctrl + a to talk")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      lineHeight: 1.2,
      letterSpacing: '0.04em',
      color: 'var(--studio-yellow)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      flex: 'none',
      whiteSpace: 'pre',
      userSelect: 'none'
    }
  }, "> "), /*#__PURE__*/React.createElement("textarea", {
    value: value,
    disabled: streaming,
    placeholder: "/commands",
    rows: pickerOpen ? 1 : 3,
    spellCheck: false,
    onChange: e => setValue(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      resize: 'none',
      font: 'inherit',
      color: 'var(--studio-yellow)',
      padding: 0
    }
  })), pickerOpen && /*#__PURE__*/React.createElement(CommandPicker, {
    query: value.slice(1),
    onSelect: c => {
      setValue('');
      onSubmit(c.label);
    }
  })));
}
Object.assign(window, {
  SiteComposer,
  ChatInterface,
  CommandPicker
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/make-noise-studio/chat.jsx", error: String((e && e.message) || e) }); }

// ui_kits/make-noise-studio/chrome.jsx
try { (() => {
/** Full-bleed wordmark as the h1, with the three-column caption row beneath. */
function SiteHeader() {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      width: '100%',
      marginTop: 12,
      marginBottom: 24,
      overflowX: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      width: '100%'
    },
    "aria-label": "Make Noise"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    style: {
      color: 'var(--raw-ink)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'start',
      gap: 16,
      paddingBottom: '0.25rem',
      fontSize: 'clamp(0.6875rem,1vw,0.8125rem)',
      fontWeight: 400,
      letterSpacing: '0.01em',
      lineHeight: 1.35,
      textTransform: 'lowercase',
      color: 'var(--raw-ink)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      justifySelf: 'start'
    }
  }, "design / technology studio"), /*#__PURE__*/React.createElement("span", {
    style: {
      justifySelf: 'center'
    }
  }, "RVA - 2025"), /*#__PURE__*/React.createElement("span", {
    style: {
      justifySelf: 'end',
      whiteSpace: 'nowrap'
    }
  }, "helping your technology meet your people")));
}
const NAV_ITEMS = [{
  label: '/what i do',
  question: 'What do you do?'
}, {
  label: "/what i've done",
  question: 'What have you done?'
}, {
  label: '/who i am',
  question: 'Who are you?'
}];

/** Yellow contact chip (flips to blue on hover) + lowercase slash nav. */
function SiteFooter({
  overlay,
  onNavigate,
  onContact
}) {
  const [hot, setHot] = React.useState(false);
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      width: '100%',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      padding: overlay ? '8px 20px' : '8px 0',
      fontFamily: 'var(--font-sans)',
      fontSize: 'clamp(0.75rem,1.1vw,0.875rem)',
      letterSpacing: '0.01em',
      textTransform: 'lowercase',
      ...(overlay ? {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20
      } : null)
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onContact,
    onMouseEnter: () => setHot(true),
    onMouseLeave: () => setHot(false),
    style: {
      background: hot ? 'var(--studio-blue)' : 'var(--studio-yellow)',
      color: hot ? 'var(--raw-paper)' : 'var(--raw-ink)',
      padding: '0.4rem 0.75rem',
      fontSize: '0.875rem',
      lineHeight: 1,
      transition: 'background-color 150ms cubic-bezier(.4,0,.2,1), color 150ms cubic-bezier(.4,0,.2,1)'
    }
  }, "/contact"), /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Site",
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'clamp(1rem,3vw,2.25rem)',
      justifyContent: 'flex-end',
      padding: '4px 0'
    }
  }, NAV_ITEMS.map(n => /*#__PURE__*/React.createElement(NavButton, {
    key: n.label,
    label: n.label,
    onClick: () => onNavigate(n.question),
    overlay: overlay
  }))));
}
function NavButton({
  label,
  onClick,
  overlay
}) {
  const [k, setK] = React.useState(0);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setK(n => n + 1),
    style: {
      color: overlay ? 'var(--raw-paper)' : 'var(--raw-ink)',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(ScrambleText, {
    key: k
  }, label));
}

/** The persistent home pill once the site is in chat mode. */
function SiteHeaderPill({
  onReset
}) {
  const [k, setK] = React.useState(0);
  const [hot, setHot] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onReset,
    onMouseEnter: () => {
      setK(n => n + 1);
      setHot(true);
    },
    onMouseLeave: () => setHot(false),
    "aria-label": "Return to Make Noise home",
    style: {
      position: 'absolute',
      top: 12,
      left: 20,
      zIndex: 20,
      background: hot ? 'var(--studio-blue)' : 'var(--studio-yellow)',
      color: hot ? 'var(--raw-paper)' : 'var(--raw-ink)',
      padding: '0.35rem 0.75rem',
      fontWeight: 700,
      fontStyle: 'italic',
      fontSize: 'clamp(0.6875rem,0.95vw,0.8125rem)',
      lineHeight: 1,
      letterSpacing: '-0.01em',
      textTransform: 'uppercase',
      userSelect: 'none',
      transition: 'background-color 150ms cubic-bezier(.4,0,.2,1), color 150ms cubic-bezier(.4,0,.2,1)'
    }
  }, /*#__PURE__*/React.createElement(ScrambleText, {
    key: k
  }, 'MAKE NOISE'));
}
Object.assign(window, {
  SiteHeader,
  SiteFooter,
  SiteHeaderPill
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/make-noise-studio/chrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pond/Document.jsx
try { (() => {
const kicker = {
  fontSize: '0.65rem',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--press-muted)'
};
function Breadcrumb({
  crumbs,
  current,
  onNavigate
}) {
  const sep = /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--press-faint)',
      opacity: .6,
      padding: '0 6px',
      userSelect: 'none'
    }
  }, "\u203A");
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    style: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'var(--press-faint)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate(null),
    style: {
      whiteSpace: 'nowrap',
      color: 'inherit',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      letterSpacing: 'inherit',
      textTransform: 'inherit'
    }
  }, "Life"), crumbs.map(c => /*#__PURE__*/React.createElement(React.Fragment, {
    key: c.id
  }, sep, /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate(c),
    title: c.title,
    style: {
      color: 'inherit',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      letterSpacing: 'inherit',
      textTransform: 'inherit'
    }
  }, c.title))), current !== undefined && /*#__PURE__*/React.createElement(React.Fragment, null, sep, /*#__PURE__*/React.createElement("span", {
    "aria-current": "page",
    style: {
      color: 'var(--press-body)'
    }
  }, current)));
}

/** A child-page card on an overview surface — dot + title, display-face stat, mono caption. */
function OverviewCard({
  title,
  stat,
  sub,
  accent,
  onOpen
}) {
  const [h, setH] = React.useState(false);
  const [press, setPress] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onOpen,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => {
      setH(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      width: '100%',
      textAlign: 'left',
      background: 'var(--press-card)',
      border: '1px solid var(--press-line)',
      borderRadius: 20,
      padding: '16px 18px',
      cursor: 'pointer',
      transition: 'transform var(--motion-settle) var(--ease-press), box-shadow var(--motion-settle) var(--ease-press)',
      transform: press ? 'translateY(0) scale(0.994)' : h ? 'translateY(-1px)' : 'none',
      boxShadow: h ? '0 2px 4px rgba(40,34,24,.05), 0 12px 30px rgba(40,34,24,.09)' : '0 1px 2px rgba(40,34,24,.04), 0 8px 24px rgba(40,34,24,.06)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: 7,
      height: 7,
      borderRadius: 2,
      flexShrink: 0,
      background: accent
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--press-ink)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      marginLeft: 'auto',
      fontSize: 15,
      color: h ? 'var(--press-accent)' : 'var(--press-faint)',
      transition: 'color var(--motion-settle)'
    }
  }, "\u203A")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontVariantNumeric: 'lining-nums tabular-nums',
      fontSize: 30,
      lineHeight: 1.15,
      color: 'var(--press-ink)',
      letterSpacing: '-0.01em'
    }
  }, stat), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11.5,
      color: 'var(--press-muted)'
    }
  }, sub)));
}

/** Block renderers — text, todo, metric. The three first-class module types. */
function TextBlock({
  block,
  onChange
}) {
  return /*#__PURE__*/React.createElement("p", {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: e => onChange({
      ...block,
      text: e.currentTarget.textContent
    }),
    style: {
      fontSize: 15,
      lineHeight: 1.6,
      color: 'var(--press-body)',
      outline: 'none',
      padding: '2px 0'
    }
  }, block.text);
}
function TodoBlock({
  block,
  onChange
}) {
  const toggle = id => onChange({
    ...block,
    items: block.items.map(i => i.id === id ? {
      ...i,
      done: !i.done
    } : i)
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, block.items.map(i => /*#__PURE__*/React.createElement("label", {
    key: i.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'pointer',
      fontSize: 14.5,
      color: i.done ? 'var(--press-muted)' : 'var(--press-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => toggle(i.id),
    role: "checkbox",
    "aria-checked": i.done,
    style: {
      width: 16,
      height: 16,
      flexShrink: 0,
      borderRadius: 5,
      display: 'grid',
      placeItems: 'center',
      border: '1px solid ' + (i.done ? 'transparent' : 'var(--press-line)'),
      background: i.done ? 'var(--press-accent)' : 'var(--press-card)',
      transition: 'background-color var(--motion-quick) var(--ease-press)'
    }
  }, i.done && /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 12 12",
    fill: "none",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2.5 6.3 L5 8.6 L9.5 3.6",
    stroke: "var(--press-card)",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      textDecoration: i.done ? 'line-through' : 'none'
    }
  }, i.text))));
}
function MetricBlock({
  block
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 12,
      padding: '6px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontVariantNumeric: 'lining-nums tabular-nums',
      fontSize: 44,
      lineHeight: 1.4,
      display: 'block',
      color: 'var(--press-ink)',
      letterSpacing: '-0.02em'
    }
  }, block.value), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: kicker
  }, block.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11.5,
      color: 'var(--press-muted)'
    }
  }, block.unit, " \xB7 ", block.trend)));
}
function BlockCanvas({
  blocks,
  onChange
}) {
  const set = nb => onChange(blocks.map(b => b.id === nb.id ? nb : b));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, blocks.map(b => /*#__PURE__*/React.createElement("div", {
    key: b.id
  }, b.type === 'text' && /*#__PURE__*/React.createElement(TextBlock, {
    block: b,
    onChange: set
  }), b.type === 'todo' && /*#__PURE__*/React.createElement(TodoBlock, {
    block: b,
    onChange: set
  }), b.type === 'metric' && /*#__PURE__*/React.createElement(MetricBlock, {
    block: b
  }))), /*#__PURE__*/React.createElement("button", {
    style: {
      alignSelf: 'flex-start',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      color: 'var(--press-faint)',
      padding: '4px 0'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 2.4v7.2M2.4 6h7.2",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  })), "Add a block"));
}
Object.assign(window, {
  Breadcrumb,
  OverviewCard,
  BlockCanvas,
  kicker
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pond/Document.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pond/Rail.jsx
try { (() => {
const INDENT_STEP = 16;
const INDENT_BASE = 6;
function Chevron({
  open
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 10 10",
    fill: "none",
    "aria-hidden": true,
    style: {
      transform: open ? 'rotate(90deg)' : 'none',
      transition: 'transform var(--motion-settle) var(--ease-press)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3.5 2 L7 5 L3.5 8",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function KindDot({
  color
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: 7,
      height: 7,
      borderRadius: 2,
      flexShrink: 0,
      background: color
    }
  });
}

/** The Life root's mark — a stylized lily pad: a disc with a cleft cut to the
 *  centre. Drawn, never a glyph; same sage as the ambient tint. */
function LifeMark() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 14 14",
    "aria-hidden": true,
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 7 L12.74 5.25 A6 6 0 1 1 8.75 1.26 Z",
    fill: "var(--press-accent)"
  }));
}

/** One treeitem row: indentation guides, caret, kind dot, label, hover ＋/×. */
function TreeRow({
  node,
  depth,
  isFolder,
  isExpanded,
  isSelected,
  isOnPath,
  isRoot,
  accent,
  leading,
  trailing,
  onSelect,
  onToggle,
  onAddChild,
  onDelete
}) {
  const [hover, setHover] = React.useState(false);
  const label = node.title || 'Untitled';
  const labelStyle = isRoot ? {
    fontSize: 14,
    fontWeight: isSelected ? 700 : 600,
    color: isSelected ? 'var(--press-ink)' : 'var(--press-body)'
  } : node.type === 'area' ? {
    fontSize: 13,
    fontWeight: 600,
    color: isSelected || isOnPath ? 'var(--press-ink)' : 'var(--press-body)'
  } : {
    fontSize: 12.5,
    fontWeight: isSelected ? 500 : 400,
    color: isSelected ? 'var(--press-ink)' : isOnPath ? 'var(--press-body)' : 'var(--press-muted)'
  };
  return /*#__PURE__*/React.createElement("div", {
    role: "treeitem",
    "aria-level": depth + 1,
    "aria-selected": isSelected,
    "aria-expanded": isFolder ? isExpanded : undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      height: 34,
      borderRadius: 10,
      paddingRight: 6,
      paddingLeft: INDENT_BASE + depth * INDENT_STEP,
      cursor: 'pointer',
      transition: 'background-color var(--motion-quick) var(--ease-out)',
      background: isSelected ? 'var(--press-accent-soft)' : hover ? 'var(--press-accent-wash)' : 'transparent'
    }
  }, Array.from({
    length: depth
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    "aria-hidden": true,
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1,
      left: INDENT_BASE + i * INDENT_STEP + 10,
      background: isSelected || isOnPath ? 'var(--press-line)' : 'var(--press-hair)'
    }
  })), isFolder ? /*#__PURE__*/React.createElement("button", {
    tabIndex: -1,
    "aria-hidden": true,
    onClick: e => {
      e.stopPropagation();
      onToggle();
    },
    style: {
      width: 20,
      height: '100%',
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      color: 'var(--press-faint)'
    }
  }, /*#__PURE__*/React.createElement(Chevron, {
    open: isExpanded
  })) : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      flexShrink: 0
    },
    "aria-hidden": true
  }), /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onSelect();
    },
    title: label,
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      textAlign: 'left',
      lineHeight: 1,
      ...labelStyle
    }
  }, leading ?? (accent !== undefined && /*#__PURE__*/React.createElement(KindDot, {
    color: accent
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, label)), trailing, !isRoot && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      opacity: hover ? 1 : 0,
      transition: 'opacity var(--motion-quick) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement(RowIcon, {
    title: "Add sub-page",
    onClick: onAddChild,
    d: "M6 2.4v7.2M2.4 6h7.2"
  }), /*#__PURE__*/React.createElement(RowIcon, {
    title: "Delete page",
    onClick: onDelete,
    d: "M3 3l6 6M9 3l-6 6",
    danger: true
  })));
}
function RowIcon({
  d,
  title,
  onClick,
  danger
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    title: title,
    "aria-label": title,
    onClick: e => {
      e.stopPropagation();
      onClick?.();
    },
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'grid',
      placeItems: 'center',
      width: 22,
      height: 22,
      borderRadius: 6,
      color: h ? danger ? 'var(--press-red)' : 'var(--press-ink)' : 'var(--press-faint)',
      background: h ? danger ? 'rgba(197,83,71,.09)' : 'rgba(27,29,20,.04)' : 'transparent',
      transition: 'color var(--motion-quick), background-color var(--motion-quick)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  })));
}

/** The left rail — one continuous recursive tree rooted at Life. */
function Rail({
  pages,
  selectedId,
  pathIds,
  expanded,
  lifeExpanded,
  onSelect,
  onToggle,
  onToggleLife,
  onLife,
  onAddChild,
  onDelete
}) {
  const children = parentId => pages.filter(p => p.parentId === parentId);
  const rows = [];
  const walk = (parentId, depth) => {
    for (const node of children(parentId)) {
      const kids = children(node.id);
      rows.push({
        node,
        depth,
        isFolder: kids.length > 0
      });
      if (kids.length && expanded.has(node.id)) walk(node.id, depth + 1);
    }
  };
  if (lifeExpanded) walk(null, 1);
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 252,
      flexShrink: 0,
      height: '100%',
      overflowY: 'auto',
      padding: '0 16px 32px',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      background: 'var(--press-paper)',
      padding: '24px 8px 16px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      color: 'var(--press-ink)'
    }
  }, "Pond")), /*#__PURE__*/React.createElement("div", {
    role: "tree",
    "aria-label": "Workspace"
  }, /*#__PURE__*/React.createElement(TreeRow, {
    node: {
      title: 'Life'
    },
    depth: 0,
    isFolder: true,
    isExpanded: lifeExpanded,
    isSelected: selectedId === null,
    isRoot: true,
    leading: /*#__PURE__*/React.createElement(LifeMark, null),
    onSelect: onLife,
    onToggle: onToggleLife,
    trailing: /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--press-faint)',
        paddingRight: 4,
        userSelect: 'none'
      }
    }, "all")
  }), rows.map(({
    node,
    depth,
    isFolder
  }) => /*#__PURE__*/React.createElement(TreeRow, {
    key: node.id,
    node: node,
    depth: depth,
    isFolder: isFolder,
    isExpanded: expanded.has(node.id),
    isSelected: node.id === selectedId,
    isOnPath: node.id !== selectedId && pathIds.has(node.id),
    accent: node.type === 'area' ? POND_SEED.accents[node.id] : undefined,
    onSelect: () => onSelect(node.id),
    onToggle: () => onToggle(node.id),
    onAddChild: () => onAddChild(node.id),
    onDelete: () => onDelete(node.id)
  }))));
}
Object.assign(window, {
  Rail,
  TreeRow,
  KindDot,
  Chevron,
  LifeMark
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pond/Rail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pond/Terminal.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const pressLetter = {
  background: 'linear-gradient(to right, var(--press-accent-wash), transparent 40%), var(--press-card)',
  border: '1px solid var(--press-line)',
  borderLeft: '2px solid var(--press-accent)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.55), 0 1px 2px rgba(33,31,27,.05)',
  borderRadius: 8,
  overflow: 'hidden',
  textAlign: 'left'
};
function PressButton({
  variant = 'default',
  children,
  onClick
}) {
  const [h, setH] = React.useState(false);
  const v = {
    default: {
      background: h ? 'color-mix(in srgb, var(--press-action) 88%, var(--press-ink))' : 'var(--press-action)',
      color: 'var(--press-action-ink)',
      border: '1px solid transparent'
    },
    outline: {
      background: h ? 'var(--press-accent-wash)' : 'transparent',
      color: 'var(--press-ink)',
      border: '1px solid var(--press-line)'
    },
    ghost: {
      background: h ? 'var(--press-accent-wash)' : 'transparent',
      color: 'var(--press-body)',
      border: '1px solid transparent'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      ...v,
      height: 24,
      padding: '0 8px',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 500,
      display: 'inline-flex',
      alignItems: 'center',
      transition: 'all var(--motion-quick) var(--ease-out)'
    }
  }, children);
}

/** A single AI-proposed composition change, as a letterpress diff card. */
function ModuleDiffCard({
  op,
  type,
  reason,
  inferred,
  preview,
  status,
  onAccept,
  onReject
}) {
  const resolved = status !== 'pending';
  const OP_LABEL = {
    create: 'addition',
    edit: 'edit',
    remove: 'removal'
  };
  return /*#__PURE__*/React.createElement("div", {
    role: "group",
    "aria-label": 'Proposed ' + OP_LABEL[op],
    style: {
      ...pressLetter,
      opacity: resolved ? .7 : 1,
      transform: resolved ? 'scale(0.99)' : 'none',
      transition: 'opacity var(--motion-settle) var(--ease-out), transform var(--motion-settle) var(--ease-press)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--press-hair)',
      padding: '6px 12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: kicker
  }, "Proposed ", OP_LABEL[op], " \xB7 ", type), inferred && /*#__PURE__*/React.createElement("span", {
    style: {
      borderRadius: 999,
      background: 'var(--raw-info-bg)',
      padding: '2px 8px',
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '.05em',
      color: 'var(--raw-info)'
    }
  }, "Inferred")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      fontSize: 14,
      color: 'var(--press-body)'
    }
  }, preview), reason && /*#__PURE__*/React.createElement("p", {
    style: {
      padding: '0 12px 8px',
      fontFamily: 'var(--font-display)',
      fontSize: 12.5,
      fontStyle: 'italic',
      color: 'var(--press-muted)'
    }
  }, reason), resolved ? /*#__PURE__*/React.createElement("div", {
    "aria-live": "polite",
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 12.5,
      fontStyle: 'italic',
      color: 'var(--press-muted)',
      borderTop: '1px solid var(--press-hair)',
      padding: '6px 12px'
    }
  }, status === 'accepted' ? 'Accepted' : 'Rejected') : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      borderTop: '1px solid var(--press-hair)',
      padding: '8px 12px'
    }
  }, /*#__PURE__*/React.createElement(PressButton, {
    onClick: onAccept
  }, "Accept"), /*#__PURE__*/React.createElement(PressButton, {
    variant: "outline"
  }, "Edit"), /*#__PURE__*/React.createElement(PressButton, {
    variant: "ghost",
    onClick: onReject
  }, "Reject")));
}
function StageText({
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-live": "polite",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 0 4px 2px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      height: 6,
      width: 6,
      flexShrink: 0,
      borderRadius: 999,
      background: 'var(--press-accent)',
      animation: 'press-pulse 2s ease-in-out infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 14,
      fontStyle: 'italic',
      color: 'var(--press-muted)'
    }
  }, label));
}

/** The full-width bottom AI terminal: transcript + composer. */
function AITerminal({
  turns,
  stage,
  value,
  onValue,
  onSubmit,
  modelTier,
  onModelTier,
  contextLabel
}) {
  const scrollRef = React.useRef(null);
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, stage]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 288,
      flexShrink: 0,
      borderTop: '1px solid var(--press-line)',
      background: 'var(--press-card)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 24px',
      borderBottom: '1px solid var(--press-hair)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: kicker
  }, "Pond"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      letterSpacing: '.12em',
      textTransform: 'uppercase',
      color: 'var(--press-faint)'
    }
  }, "context \xB7 ", contextLabel), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 4
    }
  }, ['Quick', 'Standard', 'Deep'].map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => onModelTier(t),
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      padding: '3px 8px',
      borderRadius: 999,
      background: modelTier === t ? 'var(--press-accent-soft)' : 'transparent',
      color: modelTier === t ? 'var(--press-accent)' : 'var(--press-faint)',
      transition: 'all var(--motion-quick) var(--ease-out)'
    }
  }, t)))), /*#__PURE__*/React.createElement("div", {
    ref: scrollRef,
    style: {
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      padding: '14px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, turns.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      maxWidth: 720,
      animation: 'press-rise var(--motion-calm) var(--ease-press) both'
    }
  }, t.role === 'user' ? /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14.5,
      color: 'var(--press-ink)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...kicker,
      marginRight: 8
    }
  }, "You"), t.content) : t.role === 'assistant' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14.5,
      lineHeight: 1.55,
      color: 'var(--press-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...kicker,
      marginRight: 8
    }
  }, "Pond"), t.content), t.proposal && /*#__PURE__*/React.createElement(ModuleDiffCard, _extends({}, t.proposal, {
    onAccept: t.onAccept,
    onReject: t.onReject
  }))) : null)), stage && /*#__PURE__*/React.createElement(StageText, {
    label: stage
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 24px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: e => onValue(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
    },
    placeholder: "Think out loud. Pond produces only when you ask.",
    style: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: 15,
      color: 'var(--press-ink)',
      padding: '8px 0'
    }
  }), /*#__PURE__*/React.createElement(PressButton, {
    onClick: onSubmit
  }, "Send"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -1,
      height: 1.5,
      background: 'var(--press-accent)',
      transform: focused ? 'scaleX(1)' : 'scaleX(0)',
      transformOrigin: 'left center',
      transition: 'transform var(--motion-quick) var(--ease-out)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -1,
      height: 1,
      background: 'var(--press-hair)',
      pointerEvents: 'none',
      zIndex: -1
    }
  }))));
}
Object.assign(window, {
  AITerminal,
  ModuleDiffCard,
  StageText,
  PressButton,
  pressLetter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pond/Terminal.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pond/app.jsx
try { (() => {
const glass = {
  background: 'linear-gradient(160deg, rgba(255,254,250,.84) 0%, rgba(255,254,250,.62) 100%)',
  backdropFilter: 'blur(24px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
  border: '1px solid rgba(255,255,255,.8)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 20px 54px rgba(40,34,24,.14)'
};
function TopBar({
  onCreate,
  onPalette
}) {
  const btn = {
    ...glass,
    borderRadius: 999,
    padding: '9px 14px',
    lineHeight: 1,
    color: 'var(--press-ink)',
    cursor: 'pointer'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 22,
      right: 26,
      zIndex: 40,
      display: 'flex',
      gap: 10,
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn,
      fontSize: 15
    },
    title: "New page",
    "aria-label": "New page",
    onClick: onCreate
  }, "\uFF0B"), /*#__PURE__*/React.createElement("button", {
    style: btn,
    title: "Command palette (\u2318K)",
    "aria-label": "Command palette",
    onClick: onPalette
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      padding: '2px 7px',
      borderRadius: 6,
      border: '1px solid var(--press-line)',
      background: 'rgba(33,31,27,.03)',
      color: 'var(--press-body)'
    }
  }, "\u2318K")));
}
function CommandPalette({
  pages,
  onSelect,
  onClose
}) {
  const [q, setQ] = React.useState('');
  const items = [{
    id: '__new',
    label: 'New page',
    subtitle: 'Create a new page',
    group: 'action'
  }, {
    id: '__ask',
    label: 'Ask Pond',
    subtitle: 'Focus the composer',
    group: 'action'
  }, ...pages.map(p => ({
    id: p.id,
    label: p.title,
    subtitle: p.type,
    group: 'page'
  }))].filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      background: 'rgba(33,31,27,.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-label": "Command palette",
    style: {
      position: 'absolute',
      left: '50%',
      top: '32%',
      transform: 'translate(-50%,-50%)',
      zIndex: 51,
      width: 'min(30rem, calc(100% - 4rem))',
      borderRadius: 12,
      border: '1px solid var(--press-line)',
      background: 'var(--press-paper)',
      boxShadow: '0 24px 60px rgba(40,34,24,.22)',
      overflow: 'hidden',
      animation: 'press-menu var(--motion-quick) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Search pages and actions\u2026",
    onKeyDown: e => {
      if (e.key === 'Escape') onClose();
    },
    style: {
      width: '100%',
      padding: '14px 18px',
      border: 'none',
      borderBottom: '1px solid var(--press-hair)',
      outline: 'none',
      background: 'transparent',
      fontSize: 15,
      color: 'var(--press-ink)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 280,
      overflowY: 'auto',
      padding: 6
    }
  }, items.map(i => /*#__PURE__*/React.createElement("button", {
    key: i.id,
    onClick: () => onSelect(i),
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--press-accent-wash)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    },
    style: {
      display: 'flex',
      width: '100%',
      alignItems: 'baseline',
      gap: 10,
      padding: '9px 12px',
      borderRadius: 8,
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--press-ink)'
    }
  }, i.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--press-faint)'
    }
  }, i.subtitle))))));
}
const ancestorsOf = (pages, id) => {
  const out = [];
  let cur = pages.find(p => p.id === id);
  while (cur && cur.parentId) {
    const p = pages.find(x => x.id === cur.parentId);
    if (!p) break;
    out.unshift(p);
    cur = p;
  }
  return out;
};

/** The root area a node sits under — drives its spine accent. */
const rootAreaOf = (pages, id) => ancestorsOf(pages, id)[0]?.id ?? id;

/** The display-face slot is a METRIC, never a type tag: sub-pages if the node
 *  has any, otherwise its block count. The type tag belongs in the mono caption. */
const cardStat = (pages, docs, id) => {
  const kids = pages.filter(p => p.parentId === id).length;
  return kids || docs[id]?.blocks.length || 0;
};
const cardSub = (pages, docs, node) => {
  const kids = pages.filter(p => p.parentId === node.id).length;
  const unit = kids ? kids === 1 ? 'page inside' : 'pages inside' : 'blocks';
  return node.type + ' · ' + unit;
};
function LifeOverview({
  pages,
  docs,
  onOpen
}) {
  const areas = pages.filter(p => p.parentId === null);
  const countKids = id => pages.filter(p => p.parentId === id).length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: '0 auto',
      padding: '56px 32px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      ...kicker,
      marginBottom: 10
    }
  }, "Tuesday \xB7 everything at rest"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 52,
      lineHeight: 1.05,
      color: 'var(--press-ink)',
      letterSpacing: '-0.02em',
      marginBottom: 8
    }
  }, "Life"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.6,
      color: 'var(--press-body)',
      maxWidth: 520,
      marginBottom: 40
    }
  }, "Three areas, ten pages. Nothing is waiting on you that you have not already written down."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 16
    }
  }, areas.map(a => /*#__PURE__*/React.createElement(OverviewCard, {
    key: a.id,
    title: a.title,
    stat: String(countKids(a.id)),
    sub: countKids(a.id) === 1 ? '1 page inside' : countKids(a.id) + ' pages inside',
    accent: POND_SEED.accents[a.id],
    onOpen: () => onOpen(a.id)
  }))));
}
function AreaOverview({
  page,
  pages,
  docs,
  onOpen,
  onNavigate
}) {
  const kids = pages.filter(p => p.parentId === page.id);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: '0 auto',
      padding: '40px 32px'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumb, {
    crumbs: ancestorsOf(pages, page.id),
    current: page.title,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 44,
      lineHeight: 1.05,
      color: 'var(--press-ink)',
      letterSpacing: '-0.02em',
      margin: '14px 0 32px'
    }
  }, page.title), /*#__PURE__*/React.createElement("p", {
    style: {
      ...kicker,
      marginBottom: 14
    }
  }, "Everything within"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 16
    }
  }, kids.map(k => /*#__PURE__*/React.createElement(OverviewCard, {
    key: k.id,
    title: k.title,
    stat: String(cardStat(pages, docs, k.id)),
    sub: cardSub(pages, docs, k),
    accent: POND_SEED.accents[page.id],
    onOpen: () => onOpen(k.id)
  }))));
}
function Editor({
  page,
  pages,
  docs,
  doc,
  saved,
  onTitle,
  onBlocks,
  onNavigate,
  onOpen
}) {
  const kids = pages.filter(p => p.parentId === page.id);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: '0 auto',
      padding: '32px 32px 64px'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumb, {
    crumbs: ancestorsOf(pages, page.id),
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      margin: '8px 0 20px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: page.title,
    onChange: e => onTitle(e.target.value),
    placeholder: "Untitled",
    "aria-label": "Page title",
    style: {
      flex: 1,
      fontSize: 28,
      fontWeight: 600,
      color: 'var(--press-ink)',
      border: 'none',
      outline: 'none',
      background: 'transparent'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-live": "polite",
    style: {
      fontSize: 12,
      color: 'var(--press-muted)',
      flexShrink: 0
    }
  }, saved ? 'Saved' : 'Saving…')), /*#__PURE__*/React.createElement(BlockCanvas, {
    blocks: doc.blocks,
    onChange: onBlocks
  }), kids.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 48,
      borderTop: '1px solid var(--press-hair)',
      paddingTop: 24
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      ...kicker,
      marginBottom: 14
    }
  }, "Everything within"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 16
    }
  }, kids.map(k => /*#__PURE__*/React.createElement(OverviewCard, {
    key: k.id,
    title: k.title,
    stat: String(cardStat(pages, docs, k.id)),
    sub: cardSub(pages, docs, k),
    accent: POND_SEED.accents[rootAreaOf(pages, k.id)] ?? 'var(--press-accent)',
    onOpen: () => onOpen(k.id)
  })))));
}
function App() {
  const [pages, setPages] = React.useState(POND_SEED.pages);
  const [docs, setDocs] = React.useState(POND_SEED.docs);
  const [selectedId, setSelectedId] = React.useState('strength');
  const [expanded, setExpanded] = React.useState(new Set(['health', 'routines']));
  const [lifeExpanded, setLifeExpanded] = React.useState(true);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [saved, setSaved] = React.useState(true);
  const [turns, setTurns] = React.useState([]);
  const [stage, setStage] = React.useState(null);
  const [value, setValue] = React.useState('');
  const [tier, setTier] = React.useState('Standard');
  const saveTimer = React.useRef(null);
  const page = pages.find(p => p.id === selectedId) ?? null;
  const pathIds = new Set(selectedId ? ancestorsOf(pages, selectedId).map(p => p.id) : []);
  const doc = selectedId ? docs[selectedId] : null;
  React.useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  const reveal = id => {
    const anc = ancestorsOf(pages, id).map(p => p.id);
    setLifeExpanded(true);
    setExpanded(prev => {
      const n = new Set(prev);
      anc.forEach(a => n.add(a));
      return n;
    });
  };
  const select = id => {
    reveal(id);
    setSelectedId(id);
  };
  const touchSave = () => {
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(true), 600);
  };
  const setTitle = t => {
    setPages(ps => ps.map(p => p.id === selectedId ? {
      ...p,
      title: t
    } : p));
    touchSave();
  };
  const setBlocks = nb => {
    setDocs(d => ({
      ...d,
      [selectedId]: {
        blocks: nb
      }
    }));
    touchSave();
  };
  const addChild = parentId => {
    const id = 'p' + Date.now();
    setPages(ps => [...ps, {
      id,
      parentId,
      type: 'page',
      title: 'Untitled'
    }]);
    setDocs(d => ({
      ...d,
      [id]: {
        blocks: [{
          id: 'n' + id,
          type: 'text',
          text: ''
        }]
      }
    }));
    setExpanded(prev => new Set(prev).add(parentId));
    setSelectedId(id);
  };
  const del = id => {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of pages) if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
        ids.add(p.id);
        grew = true;
      }
    }
    setPages(ps => ps.filter(p => !ids.has(p.id)));
    if (ids.has(selectedId)) setSelectedId(null);
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /** The AI loop: think together → the user calls the shot → Pond proposes a diff card. */
  const send = async () => {
    const text = value.trim();
    if (!text) return;
    setValue('');
    setTurns(t => [...t, {
      role: 'user',
      content: text
    }]);
    const asksForProduction = /\b(add|write|draft|make|create|log|track)\b/i.test(text);
    setStage(asksForProduction ? 'drafting your block…' : 'reading ' + (page?.title ?? 'Life') + '…');
    await wait(1100);
    setStage(null);
    if (asksForProduction && selectedId && docs[selectedId]) {
      const newBlock = {
        id: 'ai' + Date.now(),
        type: 'todo',
        items: [{
          id: 'x1',
          text: text.replace(/^(add|write|draft|make|create|log|track)\s+/i, ''),
          done: false
        }]
      };
      const idx = turns.length + 1;
      setTurns(t => [...t, {
        role: 'assistant',
        content: 'Here is what I would add. Nothing lands until you accept it.',
        proposal: {
          op: 'create',
          type: 'todo',
          status: 'pending',
          inferred: false,
          reason: 'You named it as a next action, so a todo reads clearer than prose.',
          preview: '☐ ' + newBlock.items[0].text
        },
        onAccept: () => {
          setDocs(d => ({
            ...d,
            [selectedId]: {
              blocks: [...d[selectedId].blocks, newBlock]
            }
          }));
          setTurns(t => t.map((x, i) => i === idx ? {
            ...x,
            proposal: {
              ...x.proposal,
              status: 'accepted'
            }
          } : x));
        },
        onReject: () => setTurns(t => t.map((x, i) => i === idx ? {
          ...x,
          proposal: {
            ...x.proposal,
            status: 'rejected'
          }
        } : x))
      }]);
    } else {
      setTurns(t => [...t, {
        role: 'assistant',
        content: "What I'm picking up is that the shape matters more than the detail right now. Want me to hold it here, or put it into the page?"
      }]);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "theme-press",
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--press-paper)',
      color: 'var(--press-ink)',
      fontFamily: 'var(--font-sans)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Rail, {
    pages: pages,
    selectedId: selectedId,
    pathIds: pathIds,
    expanded: expanded,
    lifeExpanded: lifeExpanded,
    onSelect: select,
    onToggle: id => setExpanded(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    }),
    onToggleLife: () => setLifeExpanded(v => {
      if (v) setExpanded(new Set());
      return !v;
    }),
    onLife: () => setSelectedId(null),
    onAddChild: addChild,
    onDelete: del
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, !page ? /*#__PURE__*/React.createElement(LifeOverview, {
    pages: pages,
    docs: docs,
    onOpen: select
  }) : page.type === 'area' ? /*#__PURE__*/React.createElement(AreaOverview, {
    page: page,
    pages: pages,
    docs: docs,
    onOpen: select,
    onNavigate: c => setSelectedId(c ? c.id : null)
  }) : doc ? /*#__PURE__*/React.createElement(Editor, {
    page: page,
    pages: pages,
    docs: docs,
    doc: doc,
    saved: saved,
    onTitle: setTitle,
    onBlocks: setBlocks,
    onOpen: select,
    onNavigate: c => setSelectedId(c ? c.id : null)
  }) : /*#__PURE__*/React.createElement(AreaOverview, {
    page: page,
    pages: pages,
    docs: docs,
    onOpen: select,
    onNavigate: c => setSelectedId(c ? c.id : null)
  })), /*#__PURE__*/React.createElement(AITerminal, {
    turns: turns,
    stage: stage,
    value: value,
    onValue: setValue,
    onSubmit: send,
    modelTier: tier,
    onModelTier: setTier,
    contextLabel: page ? page.title : 'Life'
  })), /*#__PURE__*/React.createElement(TopBar, {
    onCreate: () => addChild(selectedId ?? 'work'),
    onPalette: () => setPaletteOpen(true)
  })), paletteOpen && /*#__PURE__*/React.createElement(CommandPalette, {
    pages: pages,
    onClose: () => setPaletteOpen(false),
    onSelect: i => {
      setPaletteOpen(false);
      if (i.id === '__new') addChild(selectedId ?? 'work');else if (i.id !== '__ask') select(i.id);
    }
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pond/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pond/data.js
try { (() => {
/** Seed tree + documents for the Pond workspace recreation.
 *  Shape mirrors Pond-v4's pages table: every node is a page; `type` is a display tag. */
window.POND_SEED = {
  pages: [{
    id: 'health',
    parentId: null,
    type: 'area',
    title: 'Health'
  }, {
    id: 'routines',
    parentId: 'health',
    type: 'routine',
    title: 'Workout Routines'
  }, {
    id: 'strength',
    parentId: 'routines',
    type: 'page',
    title: 'Strength — Week 6'
  }, {
    id: 'mobility',
    parentId: 'routines',
    type: 'page',
    title: 'Mobility'
  }, {
    id: 'work',
    parentId: null,
    type: 'area',
    title: 'Work'
  }, {
    id: 'studio',
    parentId: 'work',
    type: 'project',
    title: 'Studio Site Rebuild'
  }, {
    id: 'brief',
    parentId: 'studio',
    type: 'page',
    title: 'Brief'
  }, {
    id: 'ceramics',
    parentId: 'work',
    type: 'project',
    title: 'Ceramics Studio Plan'
  }, {
    id: 'home',
    parentId: null,
    type: 'area',
    title: 'Home'
  }, {
    id: 'budget',
    parentId: 'home',
    type: 'page',
    title: 'Budget'
  }],
  docs: {
    strength: {
      blocks: [{
        id: 'b1',
        type: 'metric',
        label: 'Sessions this week',
        value: '4',
        unit: 'of 5',
        trend: '+1'
      }, {
        id: 'b2',
        type: 'text',
        text: 'Week six is the deload. Keep the bar speed, drop the load to 70% and stop every set two reps short.'
      }, {
        id: 'b3',
        type: 'todo',
        items: [{
          id: 't1',
          text: 'Front squat — 4×5 @ 70%',
          done: true
        }, {
          id: 't2',
          text: 'Romanian deadlift — 3×8',
          done: true
        }, {
          id: 't3',
          text: 'Weighted dips — 3×6',
          done: false
        }, {
          id: 't4',
          text: 'Carries — 4 × 40m',
          done: false
        }]
      }]
    },
    brief: {
      blocks: [{
        id: 'c1',
        type: 'text',
        text: 'The site is the proof, not the pitch. One surface, conversation as the interface, no page stack.'
      }, {
        id: 'c2',
        type: 'todo',
        items: [{
          id: 'u1',
          text: 'Lock the ASCII idle algorithms',
          done: true
        }, {
          id: 'u2',
          text: 'Write the command list',
          done: false
        }]
      }]
    }
  },
  // Area accents come off the shared palette: sage, red, navy.
  accents: {
    health: '#648F7B',
    work: '#C55347',
    home: '#12354E'
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pond/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.ICONS = __ds_scope.ICONS;

__ds_ns.NAMED_ICONS = __ds_scope.NAMED_ICONS;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.CardBody = __ds_scope.CardBody;

__ds_ns.CardFooter = __ds_scope.CardFooter;

__ds_ns.Image = __ds_scope.Image;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Label = __ds_scope.Label;

__ds_ns.Separator = __ds_scope.Separator;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Link = __ds_scope.Link;

__ds_ns.Text = __ds_scope.Text;

})();
