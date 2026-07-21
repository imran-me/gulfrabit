/* =========================================================================
   GulfRabit · Tailwind configuration (Play CDN)
   Load AFTER the Tailwind CDN script and BEFORE closing </head>:

     <script src="https://cdn.tailwindcss.com"></script>
     <script src="/shared/css/tailwind.config.js"></script>

   This exposes brand utilities like bg-gr-cyan, text-gr-lime, ring-gr-cyan,
   font-display, shadow-gr-lg — kept in exact sync with _variables.css.
   When a real build pipeline replaces the CDN later, this same object drops
   into tailwind.config.js unchanged.
   ========================================================================= */

// eslint-disable-next-line no-undef
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'gr-cyan':        '#1BB4D4',
        'gr-cyan-dark':   '#0E7C99',
        'gr-lime':        '#9ACD3C',
        'gr-lime-light':  '#C3E86B',
        'gr-black':       '#0A0A0A',
        'gr-charcoal':    '#151515',
        'gr-graphite':    '#1F1F1F',
        'gr-border':      '#2A2A2A',
        'gr-white':       '#FFFFFF',
        'gr-off-white':   '#F7F8F7',
        'gr-ink':         '#101314',
        'gr-gray-500':    '#8A8F8C',
        'gr-gray-300':    '#D8DBD9',
        'gr-success':     '#9ACD3C',
        'gr-error':       '#E5484D',
        'gr-warning':     '#E8B342',
        'gr-gold':        '#C9A24B',
      },
      fontFamily: {
        display: ['Clash Display', 'General Sans', 'Inter', 'sans-serif'],
        body:    ['Inter', 'Noto Kufi Arabic', 'sans-serif'],
      },
      fontSize: {
        // mirror the 1.25 modular scale (px → rem)
        'gr-12': '0.75rem',  'gr-14': '0.875rem', 'gr-16': '1rem',
        'gr-20': '1.25rem',  'gr-25': '1.5625rem','gr-31': '1.9375rem',
        'gr-39': '2.4375rem','gr-49': '3.0625rem',
      },
      borderRadius: { 'gr-sm': '8px', 'gr-lg': '16px' },
      boxShadow: {
        'gr-sm': '0 1px 2px rgba(0,0,0,.20), 0 1px 3px rgba(0,0,0,.14)',
        'gr-md': '0 4px 16px rgba(0,0,0,.24), 0 2px 6px rgba(0,0,0,.16)',
        'gr-lg': '0 18px 48px rgba(0,0,0,.34), 0 6px 16px rgba(0,0,0,.22)',
        'gr-glow': '0 8px 30px rgba(27,180,212,.28)',
      },
      backgroundImage: {
        'gr-gradient': 'linear-gradient(135deg, #1BB4D4 0%, #9ACD3C 100%)',
      },
      maxWidth: { 'gr-container': '1400px' },
      transitionTimingFunction: { 'gr-out': 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  corePlugins: {
    // IMPORTANT: disable Tailwind's preflight. The Play CDN injects its styles at
    // runtime AFTER our style.css, and preflight resets h1–h6 to font-size:inherit
    // — which collapsed every heading to body size. Our own reset (style.css) plus
    // Bootstrap reboot cover the base; our typography must win.
    preflight: false,
  },
};
