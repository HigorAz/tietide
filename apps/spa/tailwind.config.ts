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
    },
  },
  plugins: [],
};

export default config;
