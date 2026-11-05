/* page-source.js -- read a V8 page the way its own stylesheet reaches the browser (UI-240 slice 2).
 *
 *   const { readPage } = require('./page-source');
 *   const html = readPage('RRV8/home.html');            // home-frame.css inlined where it is linked
 *
 * WHY. Home's stylesheet was an inline <style> block until UI-240 slice 2 moved it, byte for byte, into
 * RRV8/home-frame.css so RRV8/transit.html can share it. Many suites judge Home's CSS by reading the
 * <style> blocks out of home.html. This puts the linked sheet back into the source as a <style> block at
 * the position of its <link>, which is the cascade position the browser gives it, so those suites read
 * the rules the page actually loads and their mutation arms (`src.replace('</style>', ...)`) still land.
 *
 * FAILS LOUDLY. A page that stops linking the sheet, or a sheet that is missing, throws: a suite reading
 * a page with no stylesheet would otherwise find no rule and could pass a "nothing hides X" check
 * vacuously.
 *
 * Line endings are normalised to LF unless { raw: true }, because most suites already did that.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// `text`, when given, replaces the sheet's contents: a mutation arm runs the page with an altered sheet.
function inlineSheet(html, pageAbs, href, text) {
    const re = new RegExp('<link\\b[^>]*\\bhref="' + href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>');
    const m = re.exec(html);
    if (!m || !/rel="stylesheet"/.test(m[0])) throw new Error(path.relative(ROOT, pageAbs) + ' does not link ' + href + ' as a stylesheet');
    const sheetAbs = path.join(path.dirname(pageAbs), href);
    if (!fs.existsSync(sheetAbs)) throw new Error(href + ' is linked by ' + path.relative(ROOT, pageAbs) + ' but does not exist');
    const css = typeof text === 'string' ? text : fs.readFileSync(sheetAbs, 'utf8');
    return html.slice(0, m.index) + '<style>\n' + css + '\n</style>' + html.slice(m.index + m[0].length);
}

function readPage(rel, opts) {
    opts = opts || {};
    const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    let html = fs.readFileSync(abs, 'utf8');
    // opts.override = { 'home-frame.css': '<css text>' } runs the page with that text in place of the file.
    (opts.sheets || ['home-frame.css']).forEach((href) => { html = inlineSheet(html, abs, href, (opts.override || {})[href]); });
    return opts.raw ? html : html.replace(/\r\n/g, '\n');
}

module.exports = { readPage, inlineSheet };
