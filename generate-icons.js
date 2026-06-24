// Run with: node generate-icons.js
// Generates SVG-based PNG icons for the PWA
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

if (!fs.existsSync('icons')) fs.mkdirSync('icons');

// Generate an SVG icon and save as .svg (browsers can use SVG icons too)
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#1c1c1e"/>
  <text x="50%" y="54%" font-size="${size * 0.55}" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,sans-serif" fill="white">💪</text>
</svg>`;

sizes.forEach(s => {
  fs.writeFileSync(path.join('icons', `icon-${s}.svg`), svg(s));
  console.log(`Created icons/icon-${s}.svg`);
});

console.log('Icons generated. For PNG conversion, open icons/icon-*.svg in a browser and screenshot, or use a tool like sharp/canvas.');
