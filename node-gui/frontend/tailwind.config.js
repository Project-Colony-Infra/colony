/** Colors are limited to the Project Colony palette in documentation/branding.md. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        colony: {
          navy: "#181D30",
          core: "#255DC0",
          deep: "#112860",
          ice: "#80A8EC",
          cloud: "#F3F3F6",
          sand: "#E0DFD0",
          charcoal: "#191B1C",
          slate: "#51504A",
          mist: "#C8CCD9",
          paleblue: "#B9CFF4",
          softblue: "#D4DDEE",
          lightblue: "#F1F5FD",
          nearwhite: "#EDEFF0",
          olive: "#949389",
          warmbeige: "#B9B8AC",
          coolgray: "#C2C9CC",
          grayblue: "#9EA6BD",
          midblue: "#7590CA",
          indigo: "#7A83A4",
          vibrant: "#4B83E5",
          midnight: "#071D44",
          black: "#10100E",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
