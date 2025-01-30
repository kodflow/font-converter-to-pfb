#!/usr/bin/env node

// generateGlyphs Convert local fonts TTF/OTF to glyph PBF ranges
// This script scans `src/` for .ttf/.otf files, determines the actual
// codepoints in each font, dynamically creates 256-sized ranges, then
// generates .pbf glyphs.
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

// // generateDynamicRangesFromFont Reads the TTF/OTF buffer using fontkit,
// finds the min and max codepoints, then returns an array of [start, end] blocks
// of size 256.
//
// Parameters:
// - fontBuffer: Buffer  The raw TTF/OTF content
//
// Returns:
// - ranges: number[][] An array of [start, end] for each 256-block
function generateDynamicRangesFromFont(fontBuffer) {
  // Open with fontkit
  const font = fontkit.create(fontBuffer);
  
  // Get all codepoints in this font
  // (characterSet is an array of codepoints)
  const charSet = font.characterSet;
  if (!charSet || charSet.length === 0) {
    // No glyphs found, return an empty list
    return [];
  }

  // Determine min and max
  const minCP = Math.min(...charSet);
  const maxCP = Math.max(...charSet);

  // Build 256-chunk ranges from minCP to maxCP
  const rangeSize = 256;
  const ranges = [];

  // Start from the 256 boundary below minCP
  let start = minCP - (minCP % rangeSize);
  if (start < 0) {
    // Ensure start isn't negative if the font has no negative codepoints
    start = 0;
  }

  while (start <= maxCP) {
    const end = start + rangeSize - 1;
    ranges.push([start, end]);
    start += rangeSize;
  }

  return ranges;
}

// // walkDirectory Recursively walks `dir` to find .ttf / .otf files.
//
// Parameters:
// - dir: string Directory path
//
// Returns:
// - filesList: string[] List of found TTF/OTF file paths
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

// // generateGlyphsFromFonts Walks the `srcDir`, then for each font file
// determines the dynamic ranges, then calls fontnik.range() to create the PBF.
//
// Parameters:
// - srcDir: string   The source dir containing TTF/OTF
// - distDir: string  Destination for the .pbf outputs
//
// Returns:
// - none: none
function generateGlyphsFromFonts(srcDir, distDir) {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const fontFiles = walkDirectory(srcDir);
  console.log(`Found ${fontFiles.length} font file(s) in "${srcDir}".`);

  fontFiles.forEach((fontFile) => {
    console.log(`\n🔎 Processing: ${fontFile}`);
    const fontData = fs.readFileSync(fontFile);

    // Create dynamic ranges
    const dynamicRanges = generateDynamicRangesFromFont(fontData);
    if (dynamicRanges.length === 0) {
      console.warn(`No codepoints found in this font. Skipping.`);
      return;
    }

    // Name subfolder from the file name
    const fontName = path.basename(fontFile, path.extname(fontFile));
    const fontDestDir = path.join(distDir, fontName);
    if (!fs.existsSync(fontDestDir)) {
      fs.mkdirSync(fontDestDir, { recursive: true });
    }

    // Generate each glyph range
    dynamicRanges.forEach(([start, end]) => {
      fontnik.range({ font: fontData, start, end }, (err, pbf) => {
        if (err) {
          console.error(`Error on range ${start}-${end} of ${fontFile}:`, err);
          return;
        }
        const outFile = path.join(fontDestDir, `${start}-${end}.pbf`);
        fs.writeFileSync(outFile, pbf);
        console.log(`✅ Generated: ${outFile}`);
      });
    });
  });
}

// Script entry point
(() => {
  const SRC_DIR = path.join(__dirname, 'src');
  const DIST_DIR = path.join(__dirname, 'dist', 'fonts');

  generateGlyphsFromFonts(SRC_DIR, DIST_DIR);
})();
