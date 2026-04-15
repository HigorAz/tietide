import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'deep-blue': '#0A2540',
        surface: '#112240',
        elevated: '#1A3050',
        'accent-teal': '#00D4B3',
        'accent-teal-hover': '#00E8C4',
        'text-primary': '#F6F8FA',
        'text-secondary': '#6B7C93',
        'text-muted': '#4A5568',
        success: '#12B886',
        error: '#F03E3E',
        warning: '#FAB005',
        info: '#339AF0',
        'status-idle': '#6B7C93',
        'status-running': '#FAB005',
        'status-success': '#12B886',
        'status-failed': '#F03E3E',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': {
            boxShadow: '0 0 0 0 rgba(250, 176, 5, 0.55)',
          },
          '50%': {
            boxShadow: '0 0 0 8px rgba(250, 176, 5, 0)',
          },
        },
        'living-ink': {
          '0%': { strokeDashoffset: '28' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s ease-in-out infinite',
        'living-ink': 'living-ink 1.2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
