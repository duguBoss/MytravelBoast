const fs = require('fs');
const js = fs.readFileSync('dist/assets/index-BanWuHgs.js', 'utf8');

// The render function starts after 'return' in setup
const setupStart = js.indexOf('Nd={__name:"PreviewModal"');
const returnIdx = js.indexOf('return', setupStart);
const renderStart = js.indexOf('(M,P)', returnIdx);

// Extract a chunk of the render function
const renderChunk = js.substring(renderStart, renderStart + 8000);

// Search for button click patterns
const patterns = ['onClick', 'play', 'record', 'disabled', 'template'];
patterns.forEach(p => {
  const idx = renderChunk.indexOf(p);
  if (idx >= 0) {
    console.log('\n--- Found:', p, 'at', idx, '---');
    console.log(renderChunk.substring(Math.max(0, idx - 80), idx + 120));
  }
});

// Also look for the specific button rendering pattern
console.log('\n=== Looking for button with play ===');
const playIdx = renderChunk.indexOf('play');
if (playIdx >= 0) {
  console.log(renderChunk.substring(playIdx - 200, playIdx + 200));
}
