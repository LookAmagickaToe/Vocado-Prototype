# Theme System

The app's color scheme is centrally managed through a JSON configuration file.

## Configuration File

**Location**: `/data/theme/colors.json`

This file defines all theme colors in a structured format. Colors are specified using:
- **HSL values** for background/foreground colors (hue, saturation, lightness)
- **RGB values** for Vocado-specific accent colors

## Current Background Color

- **Previous**: `48° 25% 93%` (very bright cream)
- **Current**: `40° 28% 88%` (darker, creamier - better contrast with white containers)

The new background is:
- 5% darker (88% vs 93% lightness)
- 3% more saturated (28% vs 25% saturation)
- Warmer hue (40° vs 48° - more yellow/cream tone)

## How to Change Colors

1. Edit `/data/theme/colors.json`
2. Run the theme generator:
   ```bash
   node scripts/generate-theme.js
   ```
3. The script will regenerate `/app/globals.css` with your new colors

## Example - Changing Background

```json
{
  "light": {
    "background": {
      "hue": 40,        // 0-360 (color wheel position)
      "saturation": 28, // 0-100 (color intensity)
      "lightness": 88   // 0-100 (dark to light)
    }
  }
}
```

## Color Variables Used in App

- `--background`: Main app background
- `--foreground`: Main text color
- `--card`: Card/container background
- `--vocado-accent-rgb`: Main green accent (buttons, highlights)
- `--vocado-accent-dark-rgb`: Darker green for hover states
- `--vocado-header-bg-rgb`: Header background
- `--vocado-footer-bg-rgb`: Footer background

All these are now centrally managed in `colors.json`!
