// Schema-only fingerprint tests for the Export Analyzer.
//
// For each fixture in fingerprints.json, opens the .xlsx, finds the
// header row (matching the analyzer's Helpers.readHeaders behavior:
// scan rows 1-3, normalize cells to lowercase + whitespace-stripped,
// pick the row containing any of the manifest's anchorTokens), and
// asserts every requiredHeader is present. Mirrors the schema check
// the analyzer's detect() does — does not run detect() itself.
//
// Run locally:  node run-fingerprint-tests.mjs
// Run in CI:    .github/workflows/analyzer-tests.yml
//
// Exits 1 on any failure so CI fails loudly.

import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, 'fingerprints.json'), 'utf8'));

const normalize = v => {
  if (v == null) return '';
  const text = typeof v === 'object' ? (v.text ?? v.result ?? v) : v;
  return String(text).toLowerCase().replace(/\s+/g, '').trim();
};

const readSheetHeaders = (sheet) => {
  const rows = [];
  for (let r = 1; r <= 3; r++) {
    const row = sheet.getRow(r);
    const headers = [];
    for (let c = 1; c <= 30; c++) {
      const v = row.getCell(c).value;
      if (v == null) continue;
      headers.push(normalize(v));
    }
    rows.push(headers);
  }
  return rows;
};

let passed = 0;
let failed = 0;

for (const fx of manifest.fixtures) {
  const label = `${fx.file} (template: ${fx.template})`;
  console.log(`\n[${label}]`);

  const fixturePath = join(__dirname, fx.file);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(fixturePath);
  } catch (e) {
    console.error(`  FAIL — could not open xlsx: ${e.message}`);
    failed++;
    continue;
  }

  const anchors = fx.anchorTokens.map(normalize);
  const required = fx.requiredHeaders.map(normalize);

  let matchedSheet = null;
  let matchedHeaders = null;
  let matchedRowIdx = null;
  outer: for (const ws of wb.worksheets) {
    const rows = readSheetHeaders(ws);
    for (let i = 0; i < rows.length; i++) {
      if (anchors.some(a => rows[i].includes(a))) {
        matchedSheet = ws.name;
        matchedHeaders = rows[i];
        matchedRowIdx = i + 1;
        break outer;
      }
    }
  }

  if (!matchedHeaders) {
    console.error(`  FAIL — no row in any sheet contains any anchor token (${anchors.join(', ')})`);
    failed++;
    continue;
  }

  const missing = required.filter(h => !matchedHeaders.includes(h));
  if (missing.length) {
    console.error(`  FAIL — sheet "${matchedSheet}" row ${matchedRowIdx} missing required headers: ${missing.join(', ')}`);
    console.error(`         found headers: ${matchedHeaders.join(', ')}`);
    failed++;
  } else {
    console.log(`  PASS — sheet "${matchedSheet}" row ${matchedRowIdx} has all ${required.length} required headers`);
    passed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
