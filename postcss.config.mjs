// PostCSS pipeline:
//   1. postcss-preset-mantine — converts Mantine's px→rem helpers and
//      light-dark() function for components in /w/* (Workryn).
//   2. @tailwindcss/postcss — Tailwind v4 engine used elsewhere.
// The order matters: Mantine preset must run first so Tailwind sees the
// resolved CSS.
const config = {
  plugins: {
    'postcss-preset-mantine': {},
    '@tailwindcss/postcss': {},
  },
}

export default config
