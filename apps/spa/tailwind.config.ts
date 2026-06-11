import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'deep-blue': '#0A2540',
        // A notch darker than deep-blue — the workflow editor canvas base, so it
        // reads calmer/darker than the login surface while staying on-brand.
        canvas: '#06182E',
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
        // Type colors for the run-result data viewer (JsonTree value tinting).
        // CONTEXT-locked sketch 002-D palette.
        'data-key': '#c5d5e8',
        'data-string': '#7ee2c7',
        'data-number': '#74c0fc',
        'data-boolean': '#da77f2',
        'data-null': '#6b7c93',
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
        // Gentle, always-on "tide" flow for idle editor edges (slower + subtler
        // than the active living-ink flow), echoing the auth-page tide lines.
        'tide-flow': {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s ease-in-out infinite',
        'living-ink': 'living-ink 1.2s linear infinite',
        'tide-flow': 'tide-flow 2.8s linear infinite',
      },
    },
  },
  plugins: [typography],
};

export default config;
