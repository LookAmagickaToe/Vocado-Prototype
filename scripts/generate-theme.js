#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read colors from JSON
const colorsPath = path.join(__dirname, '../data/theme/colors.json');
const colors = JSON.parse(fs.readFileSync(colorsPath, 'utf8'));

// Generate CSS content
const generateCSS = () => {
    const { light, dark } = colors;

    return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}

@layer base {
  :root {
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);
    --background: ${light.background.hue} ${light.background.saturation}% ${light.background.lightness}%;
    --foreground: ${light.foreground.hue} ${light.foreground.saturation}% ${light.foreground.lightness}%;
    --card: ${light.card.hue} ${light.card.saturation}% ${light.card.lightness}%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --vocado-accent-rgb: ${light.vocadoAccent.r} ${light.vocadoAccent.g} ${light.vocadoAccent.b};
    --vocado-accent-dark-rgb: ${light.vocadoAccentDark.r} ${light.vocadoAccentDark.g} ${light.vocadoAccentDark.b};
    --vocado-header-bg-rgb: ${light.vocadoHeader.r} ${light.vocadoHeader.g} ${light.vocadoHeader.b};
    --vocado-footer-bg-rgb: ${light.vocadoFooter.r} ${light.vocadoFooter.g} ${light.vocadoFooter.b};
    --vocado-divider-rgb: ${light.vocadoDivider.r} ${light.vocadoDivider.g} ${light.vocadoDivider.b};
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --radius: 0.5rem;
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 240 5.9% 10%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
  .dark {
    --background: ${dark.background.hue} ${dark.background.saturation}% ${dark.background.lightness}%;
    --foreground: ${dark.foreground.hue} ${dark.foreground.saturation}% ${dark.foreground.lightness}%;
    --card: ${dark.card.hue} ${dark.card.saturation}% ${dark.card.lightness}%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-primary: 224.3 76.3% 48%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;
};

// Write to globals.css
const globalsPath = path.join(__dirname, '../app/globals.css');
const cssContent = generateCSS();
fs.writeFileSync(globalsPath, cssContent, 'utf8');

console.log('✅ Generated globals.css from colors.json');
console.log(`Background color: ${colors.light.background.hue}° ${colors.light.background.saturation}% ${colors.light.background.lightness}%`);
