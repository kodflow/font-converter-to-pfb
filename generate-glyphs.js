#!/usr/bin/env node

// generateGlyphs Convert local fonts TTF/OTF to glyph PBF ranges
// This script scans `src/` for .ttf/.otf files, determines the actual
// codepoints in each font, dynamically creates 256-sized ranges up to 65535,
// then generates .pbf glyphs in dist/fonts.
//
// It also cleans dist/fonts before rebuilding.
//
// Parameters:
// - none: none
//
// Returns:
// - none: none

const fs = require('fs');
const path = require('path');
const fontnik = require('fontnik');
const fontkit = require('fontkit');

function cleanDist(distDir) {
  // fs.rmSync est dispo depuis Node 14.14
  if (fs.existsSync(distDir)) {
    console.log(`\n🧹 Cleaning existing dist folder: ${distDir}`);
    fs.rmSync(distDir, { recursive: true, force: true });
  }
}

function generateDynamicRangesFromFont(fontBuffer) {
  const font = fontkit.create(fontBuffer);
  const charSet = font.characterSet;
  if (!charSet || charSet.length === 0) {
    return [];
  }

  const minCP = Math.min(...charSet);
  const maxCP = Math.max(...charSet);

  // Borne maxCP à 65535 pour éviter l'erreur 'end' must be <= 65535
  const limitedMax = Math.min(maxCP, 65535);

  const rangeSize = 256;
  const ranges = [];

  let start = minCP - (minCP % rangeSize);
  if (start < 0) {
    start = 0;
  }

  while (start <= limitedMax) {
    let end = start + rangeSize - 1;
    if (end > 65535) {
      end = 65535;
    }
    ranges.push([start, end]);
    start += rangeSize;
  }

  return ranges;
}

function walkDirectory(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDirectory(filePath));
    } else {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.ttf' || ext === '.otf') {
        results.push(filePath);
      }
    }
  });
  return results;
}

function generateGlyphsFromFonts(srcDir, distDir) {
  cleanDist(distDir);
  fs.mkdirSync(distDir, { recursive: true });

  const fontFiles = walkDirectory(srcDir);
  console.log(`\n📂 Found ${fontFiles.length} font file(s) in "${srcDir}".`);

  fontFiles.forEach((fontFile) => {
    console.log(`\n🔎 Processing: ${fontFile}`);
    const fontData = fs.readFileSync(fontFile);

    const dynamicRanges = generateDynamicRangesFromFont(fontData);
    if (dynamicRanges.length === 0) {
      console.warn(`⚠️  No codepoints found in this font. Skipping.`);
      return;
    }

    const fontName = path.basename(fontFile, path.extname(fontFile));
    const fontDestDir = path.join(distDir, fontName);
    fs.mkdirSync(fontDestDir, { recursive: true });

    // Génération des blocs de glyphes
    dynamicRanges.forEach(([start, end]) => {
      fontnik.range({ font: fontData, start, end }, (err, pbf) => {
        if (err) {
          console.error(`❌ Error on range ${start}-${end} of ${fontFile}:`, err);
          return;
        }
        const outFile = path.join(fontDestDir, `${start}-${end}.pbf`);
        fs.writeFileSync(outFile, pbf);
        console.log(`✅ Generated: ${outFile}`);
      });
    });
  });
}

(() => {
  const SRC_DIR = path.join(__dirname, 'src');
  const DIST_DIR = path.join(__dirname, 'dist', 'fonts');
  generateGlyphsFromFonts(SRC_DIR, DIST_DIR);
})();
