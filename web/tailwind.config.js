/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#F6F6F3',
        surface: '#FFFFFF',
        ink: '#15171A',
        muted: '#5E636B',
        line: '#E6E6E1',
        soft: '#F0F0EB',
        brand: '#146B4E',
        'brand-soft': '#E3F1EA',
        voice: '#5B4BC4',
        'voice-soft': '#EEEBFC',
        'voice-panel': '#1E1838',
        'voice-highlight': '#E4DFFC',
        'warn-bg': '#FFF4DE',
        'warn-ink': '#5A3500',
        'logo-dot': '#D35A3A',
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque"', 'sans-serif'],
        sans: [
          'Figtree',
          '"Noto Sans Tamil"',
          '"Noto Sans Devanagari"',
          '"Noto Sans Kannada"',
          '"Noto Sans Malayalam"',
          '"Noto Sans Telugu"',
          'sans-serif',
        ],
        tamil: ['"Noto Sans Tamil"', 'sans-serif'],
        hindi: ['"Noto Sans Devanagari"', 'sans-serif'],
        kannada: ['"Noto Sans Kannada"', 'sans-serif'],
        malayalam: ['"Noto Sans Malayalam"', 'sans-serif'],
        telugu: ['"Noto Sans Telugu"', 'sans-serif'],
      },
      borderRadius: {
        card: '22px',
        sheet: '28px',
      },
      keyframes: {
        cardIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        sheetIn: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'card-in': 'cardIn 380ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'card-in-1': 'cardIn 380ms 60ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'card-in-2': 'cardIn 380ms 120ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'card-in-3': 'cardIn 380ms 180ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'sheet-in': 'sheetIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
    },
  },
  plugins: [],
}
