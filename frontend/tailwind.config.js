/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Consolas', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: {
          DEFAULT: '#F3F6FA', // Cool light blue-grey main page background
          surface: '#FFFFFF', // Main panels and cards
          subtle: '#EAF0F7',  // Secondary surfaces
          muted: '#D7E0EB',   // Subtle borders and dividers
          border: '#D7E0EB',  // Borders and dividers
        },
        brand: {
          primary: '#E87532', // Retrace Primary Brand Orange
          'primary-hover': '#C85A20', // Darker orange for hover/active states
          orange: '#E87532',
          'orange-hover': '#C85A20',
          'orange-light': '#FDF2EB',
          secondary: '#315EFB', // Technical blue secondary accent
          blue: '#315EFB',
          'blue-light': '#EEF2FE',
          accent: '#0F9D91',  // Restrained teal
          teal: '#0F9D91',
          'teal-light': '#EDF8F7',
        },
        ink: {
          DEFAULT: '#17243A', // Deep navy primary text
          secondary: '#58677D', // Secondary text
          muted: '#8594A6',    // Muted technical labels
          border: '#D7E0EB',
        },
        status: {
          red: '#C93845',        // Critical / failing / unreachable
          'red-bg': '#FDF2F3',
          'red-border': '#F8CFD3',
          amber: '#B9770E',      // Degraded / warning
          'amber-bg': '#FEF8EE',
          'amber-border': '#F9E5C4',
          green: '#23845B',      // Healthy / success
          'green-bg': '#EEF8F3',
          'green-border': '#C3E7D5',
          blue: '#315EFB',       // Informational
          'blue-bg': '#EEF2FE',
          'blue-border': '#CDDAFE',
        }
      }
    },
  },
  plugins: [],
}
