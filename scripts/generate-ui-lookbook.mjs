#!/usr/bin/env node
// Generate docs/ui-lookbook.html — a self-contained visual reference for all
// general UI elements in Patzer Pro. Reads colors from live source files so
// the lookbook stays in sync with the codebase.
//
// Usage: npm run ui-lookbook:generate

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outPath = resolve(root, 'docs', 'ui-lookbook.html');

// ---------------------------------------------------------------------------
// Source file readers
// ---------------------------------------------------------------------------

const scss = readFileSync(resolve(root, 'src/styles/main.scss'), 'utf8');
const moveListTs = readFileSync(resolve(root, 'src/analyse/moveList.ts'), 'utf8');
const boardTs = readFileSync(resolve(root, 'src/board/index.ts'), 'utf8');
const engineCtrlTs = readFileSync(resolve(root, 'src/engine/ctrl.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Extractors — pull live values from source files
// ---------------------------------------------------------------------------

function extractScssValue(pattern) {
  const m = scss.match(pattern);
  return m ? m[1] : null;
}

function extractAllScssMatches(pattern) {
  const results = [];
  let m;
  const re = new RegExp(pattern, 'g');
  while ((m = re.exec(scss)) !== null) results.push(m);
  return results;
}

// Root CSS variables
const bgColor = extractScssValue(/--bg:\s*(#[0-9a-fA-F]+)/) || '#1a1a1a';
const textColor = extractScssValue(/--text:\s*(#[0-9a-fA-F]+)/) || '#e8e8e8';

// Glyph colors from moveList.ts
function extractGlyphColors() {
  const colors = {};
  const re = /'([?!]+|M\?!)'\s*:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(moveListTs)) !== null) {
    colors[m[1]] = m[2];
  }
  return colors;
}

// Arrow brush colors from board/index.ts
function extractArrowBrushes() {
  const brushes = {};
  // Pattern: key: { color: '#xxx', opacity: N, lineWidth: N }
  const re = /(\w+)\s*:\s*\{\s*color:\s*'(#[0-9a-fA-F]+)'\s*,\s*opacity:\s*([\d.]+)\s*,\s*lineWidth:\s*(\d+)/g;
  let m;
  while ((m = re.exec(boardTs)) !== null) {
    brushes[m[1]] = { color: m[2], opacity: parseFloat(m[3]), lineWidth: parseInt(m[4]) };
  }
  return brushes;
}

// WDL bar colors
function extractWdlColors(prefix) {
  const w = extractScssValue(new RegExp(prefix + '[\\s\\S]*?\\.wdl-w\\s*\\{\\s*background:\\s*(#[0-9a-fA-F]+)'));
  const d = extractScssValue(new RegExp(prefix + '[\\s\\S]*?\\.wdl-d\\s*\\{\\s*background:\\s*(#[0-9a-fA-F]+)'));
  const l = extractScssValue(new RegExp(prefix + '[\\s\\S]*?\\.wdl-l\\s*\\{\\s*background:\\s*(#[0-9a-fA-F]+)'));
  return { win: w, draw: d, loss: l };
}

// Eval bar colors
const evalBarBg = extractScssValue(/\.eval-bar\s*\{[^}]*background:\s*(#[0-9a-fA-F]+)/) || '#333';
const evalBarFill = extractScssValue(/\.eval-bar__fill\s*\{[^}]*background:\s*(#[0-9a-fA-F]+)/) || '#c8c8c8';

const glyphColors = extractGlyphColors();
const arrowBrushes = extractArrowBrushes();

// Patzer green palette — find all occurrences of the accent greens
function extractGreenPalette() {
  const greens = new Map();
  // Known greens to look for
  const knownGreens = [
    { hex: '#629924', name: 'Primary accent' },
    { hex: '#44aa99', name: 'Toggle/action green (#4a9)' },
    { hex: '#3a6e46', name: 'Win bar (card)' },
    { hex: '#5b9b5b', name: 'Win bar (overview)' },
    { hex: '#5a9a6a', name: 'Win label' },
    { hex: '#2d7a3a', name: 'Loading gradient start' },
    { hex: '#2a4a2a', name: 'Import button bg' },
    { hex: '#1e3a1e', name: 'Active filter pill bg' },
    { hex: '#15781B', name: 'Arrow brush green' },
    { hex: '#22ac38', name: 'Good move glyph' },
    { hex: '#168226', name: 'Brilliant move glyph' },
  ];
  for (const g of knownGreens) {
    // Count occurrences in scss
    const count = (scss.match(new RegExp(g.hex.replace('#', '#'), 'gi')) || []).length;
    greens.set(g.hex, { ...g, count });
  }
  return [...greens.values()];
}

const greenPalette = extractGreenPalette();

// Button styles — extract key properties
const buttonStyles = [
  { name: 'Flat button', cls: '.fbt', bg: 'transparent', color: '#bbb', hoverBg: 'rgba(56,147,232,0.15)', hoverColor: '#e0e0e0', radius: '6px', source: 'main.scss ~line 1862' },
  { name: 'Control button', cls: '.analyse__controls button', bg: '#1e1e1e', color: '#bbb', hoverBg: 'rgba(56,147,232,0.15)', hoverColor: '#e0e0e0', radius: '6px', source: 'main.scss ~line 1948' },
  { name: 'Primary action', cls: '.puzzle__next', bg: '#4a9', color: '#111', hoverBg: '#5bb', hoverColor: '#111', radius: '4px', source: 'main.scss ~line 5697' },
  { name: 'Secondary button', cls: '.puzzle__hint', bg: '#333', color: '#ccc', hoverBg: '#444', hoverColor: '#ccc', radius: '4px', source: 'main.scss ~line 5675' },
  { name: 'Import button', cls: '.header import btn', bg: '#2a4a2a', color: '#8f8', hoverBg: '#335533', hoverColor: '#8f8', radius: '6px', source: 'main.scss ~line 223' },
];

// Toggle states
const toggleOff = { bg: '#444', knob: '#ccc' };
const toggleOn = { bg: '#4a9', knob: '#fff' };

// Input field styles
const inputStyles = [
  { name: 'Text input', bg: '#111', border: '#383838', focusBorder: '#5a9a5a', color: '#e0e0e0', radius: '6px' },
  { name: 'Range slider track', bg: '#3a3a3a', height: '0.5em', thumbBorder: '#777', thumbBg: '#999', hoverThumb: '#4a9' },
  { name: 'PGN textarea', bg: '#111', border: '#333', focusBorder: '#555', color: '#ccc', font: 'monospace' },
];

// Nav tab colors
const navColors = { default: '#888', hover: '#ccc', hoverBg: '#1a1a1a', active: '#e8e8e8' };

// Badge colors extracted from scss
const badgeColors = [
  { cls: '--ok', color: '#4a8', label: 'Analyzed', source: 'games/view.ts' },
  { cls: '--warn', color: '#f84', label: 'Warning', source: 'games/view.ts' },
  { cls: '--missed-mate', color: '#a855f7', label: 'Missed mate', source: 'games/view.ts' },
];

// Loading bar
const loadingBar = { bg: '#252525', fillStart: '#2d7a3a', fillEnd: '#4a9', textColor: '#fff', pctColor: '#4a9' };

// WDL sets
const wdlCard = { win: '#3a6e46', draw: '#3a3a3a', loss: '#5c2e2e' };
const wdlOverview = { win: '#5b9b5b', draw: '#666', loss: '#9b5b5b' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function contrastText(hex) {
  if (!hex || !hex.startsWith('#')) return '#e8e8e8';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#1a1a1a' : '#e8e8e8';
}

function swatch(color, size = 20) {
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:3px;background:${color};border:1px solid rgba(255,255,255,0.1);vertical-align:middle"></span>`;
}

// ---------------------------------------------------------------------------
// Build HTML
// ---------------------------------------------------------------------------

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patzer Pro \u2014 General UI Lookbook</title>
<style>
:root { --bg: ${bgColor}; --text: ${textColor}; --border: #3a3a3a; --accent: #629924; }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; line-height: 1.6; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.header { position: sticky; top: 0; z-index: 100; background: #111; border-bottom: 1px solid var(--border); padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.header h1 { margin: 0; font-size: 22px; font-weight: 600; white-space: nowrap; }
.header nav { display: flex; gap: 12px; flex-wrap: wrap; font-size: 15px; }
.header .regen-hint { margin-left: auto; }
.header .regen-hint button { background: var(--border); color: var(--text); border: 1px solid #555; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 14px; }

.content { max-width: 1200px; margin: 0 auto; padding: 20px; }
section { margin-bottom: 48px; }
h2 { font-size: 24px; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
h3 { font-size: 18px; margin: 24px 0 8px; }

table { width: 100%; border-collapse: collapse; font-size: 16px; }
th { text-align: left; padding: 8px 10px; background: #222; border-bottom: 2px solid var(--border); font-weight: 600; }
td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
code { background: #333; padding: 2px 6px; border-radius: 3px; font-size: 14px; }

.usage-note { background: #222; border: 1px solid #3a3a3a; border-radius: 6px; padding: 12px 16px; font-size: 14px; line-height: 1.6; margin-top: 16px; margin-bottom: 0; color: #bbb; position: relative; cursor: pointer; }
.usage-note strong { color: #ddd; }
.usage-note code { color: #ccc; }
.usage-note ul { color: #aaa; }
.usage-note .usage-summary { display: block; padding-right: 90px; }
.usage-note .usage-expand { position: absolute; bottom: 10px; right: 14px; font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; pointer-events: none; transition: color 0.15s; }
.usage-note:hover .usage-expand { color: #999; }
.usage-note.expanded .usage-expand .expand-text { display: none; }
.usage-note .usage-expand .collapse-text { display: none; }
.usage-note.expanded .usage-expand .collapse-text { display: inline; }
.usage-note .usage-expand .expand-icon { transition: transform 0.2s; }
.usage-note.expanded .usage-expand .expand-icon { transform: rotate(180deg); }
.usage-note .usage-details { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #3a3a3a; color: #999; }
.usage-note.expanded .usage-details { display: block; }

.color-strip { display: flex; border-radius: 6px; overflow: hidden; margin-bottom: 16px; }
.color-strip__item { flex: 1; padding: 12px 6px; text-align: center; font-size: 13px; line-height: 1.3; min-width: 0; }
.color-strip__item .label { font-weight: 600; font-size: 14px; display: block; }
.color-strip__item .hex { opacity: 0.7; font-size: 12px; }

.demo-row { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; align-items: center; }
.demo-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #303030; font-size: 14px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.demo-toggle { position: relative; width: 36px; height: 20px; border-radius: 10px; display: inline-block; vertical-align: middle; }
.demo-toggle .knob { position: absolute; width: 16px; height: 16px; border-radius: 50%; top: 2px; transition: transform 0.2s; }
.demo-input { padding: 8px 12px; border-radius: 6px; border: 1px solid; font-size: 14px; font-family: inherit; width: 200px; }
.demo-arrow { display: inline-block; width: 120px; height: 30px; border-radius: 4px; position: relative; overflow: hidden; }
.demo-arrow .shaft { position: absolute; top: 50%; left: 10px; right: 30px; height: 4px; transform: translateY(-50%); border-radius: 2px; }
.demo-arrow .head { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 0; height: 0; border-left: 10px solid; border-top: 6px solid transparent; border-bottom: 6px solid transparent; }

.wdl-bar { display: flex; height: 22px; border-radius: 4px; overflow: hidden; margin: 4px 0; }
.wdl-bar > div { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }

.eval-bar-demo { width: 26px; height: 160px; background: ${evalBarBg}; border-radius: 3px; position: relative; overflow: hidden; display: inline-block; vertical-align: top; box-shadow: inset 0 0 4px rgba(0,0,0,0.5); }
.eval-bar-demo .fill { position: absolute; bottom: 0; left: 0; right: 0; background: ${evalBarFill}; transition: height 0.3s; }
.eval-bar-demo .tick { position: absolute; left: 0; right: 0; border-bottom: 1px solid #888; opacity: 0.35; }
.eval-bar-demo .tick.zero { border-bottom: 2px solid #aaa; opacity: 0.7; }
.eval-bar-demo .score { position: absolute; left: 50%; transform: translateX(-50%); font-size: 8px; font-weight: 700; color: #fff; text-shadow: 0 0 3px rgba(0,0,0,0.9); }

.nav-demo { display: inline-flex; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 3px; gap: 2px; }
.nav-demo button { background: transparent; border: none; color: #bbb; padding: 5px 10px; border-radius: 5px; font-size: 16px; cursor: pointer; font-family: inherit; }
.nav-demo button:hover { background: rgba(56,147,232,0.15); color: #e0e0e0; }

.move-demo { display: inline-flex; gap: 0; background: #141414; border-radius: 4px; overflow: hidden; font-size: 14px; }
.move-demo .idx { background: #141414; color: #666; padding: 4px 6px; min-width: 28px; text-align: center; }
.move-demo .mv { padding: 4px 8px; cursor: pointer; }
.move-demo .mv:hover { background: rgba(255,255,255,0.05); }
.move-demo .mv.active { background: rgba(56,147,232,0.2); color: #fff; }

.badge-demo { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 13px; font-weight: 600; background: #222; border: 1px solid #333; margin-right: 8px; }

.loading-bar-demo { width: 300px; height: 22px; background: ${loadingBar.bg}; border-radius: 11px; overflow: hidden; position: relative; }
.loading-bar-demo .fill { height: 100%; border-radius: 11px; background: linear-gradient(90deg, ${loadingBar.fillStart}, ${loadingBar.fillEnd}); display: flex; align-items: center; justify-content: center; font-size: 12px; color: ${loadingBar.textColor}; font-weight: 600; text-shadow: 0 0 4px rgba(0,0,0,0.5); }

.tab-demo { display: inline-flex; gap: 2px; }
.tab-demo a { padding: 6px 10px; font-size: 15px; border-radius: 4px; cursor: pointer; transition: all 0.15s; }
</style>
</head>
<body>
<div class="header">
  <h1>General UI Lookbook</h1>
  <nav>
    <a href="#foundations">Foundations</a>
    <a href="#green-palette">Greens</a>
    <a href="#arrows">Arrows</a>
    <a href="#eval-bar">Eval Bar</a>
    <a href="#wdl">W/D/L Bars</a>
    <a href="#buttons">Buttons</a>
    <a href="#toggles">Toggles</a>
    <a href="#inputs">Inputs</a>
    <a href="#nav">Navigation</a>
    <a href="#tabs">Tabs</a>
    <a href="#move-list">Move List</a>
    <a href="#badges">Badges</a>
    <a href="#loading">Loading</a>
    <a href="../docs/feedback-lookbook.html">Feedback Lookbook \u2192</a>
  </nav>
  <div class="regen-hint">
    <button onclick="alert('Run: npm run ui-lookbook:generate\\nThen refresh this page.')">Regenerate</button>
  </div>
</div>

<div class="content">

<!-- 1. FOUNDATIONS -->
<section id="foundations">
<h2>1. Foundations</h2>
<table>
<thead><tr><th>Variable</th><th>Value</th><th>Swatch</th><th>Usage</th></tr></thead>
<tbody>
<tr><td><code>--bg</code></td><td><code>${bgColor}</code></td><td>${swatch(bgColor)}</td><td>Page background</td></tr>
<tr><td><code>--text</code></td><td><code>${textColor}</code></td><td>${swatch(textColor)}</td><td>Default text color</td></tr>
<tr><td><code>--border</code></td><td><code>#3a3a3a</code></td><td>${swatch('#3a3a3a')}</td><td>Borders, dividers, separators</td></tr>
<tr><td><code>--accent</code></td><td><code>#629924</code></td><td>${swatch('#629924')}</td><td>Primary accent (links, active states)</td></tr>
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> The base dark theme that underpins every screen in the app. All text, backgrounds, and borders derive from these root values.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Every page \u2014 all tools</li></ul></div></div>
</section>

<!-- 2. GREEN PALETTE -->
<section id="green-palette">
<h2>2. Patzer Pro Green Palette</h2>
<div class="color-strip">
${greenPalette.sort((a, b) => {
  // Sort by luminance (darkest to lightest)
  const lum = (hex) => { const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16); return 0.299*r+0.587*g+0.114*b; };
  return lum(a.hex) - lum(b.hex);
}).map(g => `  <div class="color-strip__item" style="background:${g.hex};color:${contrastText(g.hex)}">
    <span class="label">${esc(g.name)}</span>
    <span class="hex">${g.hex}</span>
  </div>`).join('\n')}
</div>
<table>
<thead><tr><th>Swatch</th><th>Hex</th><th>Name</th><th>SCSS occurrences</th></tr></thead>
<tbody>
${greenPalette.map(g => `<tr><td>${swatch(g.hex)}</td><td><code>${g.hex}</code></td><td>${esc(g.name)}</td><td>${g.count}</td></tr>`).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Green is the signature color of Patzer Pro. Different shades appear in toggle switches, buttons, loading bars, import controls, win/loss indicators, and the primary accent throughout navigation and links.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Toggle switches \u2014 all tools (settings panels)</li><li>Primary action buttons \u2014 Puzzles tool</li><li>Import button \u2014 header</li><li>Loading bars \u2014 Opponents tool</li><li>Active filter pills \u2014 Games tab, Opponents tool</li><li>Win bars in W/D/L \u2014 Opponents tool</li><li>Board glyph badges (good/brilliant) \u2014 Game Analysis tool</li><li>Arrow brush \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- 3. ENGINE ARROWS -->
<section id="arrows">
<h2>3. Engine Arrows</h2>
<table>
<thead><tr><th>Brush</th><th>Color</th><th>Swatch</th><th>Opacity</th><th>Line Width</th><th>Preview</th></tr></thead>
<tbody>
${Object.entries(arrowBrushes).map(([name, b]) => `<tr>
  <td><code>${esc(name)}</code></td>
  <td><code>${b.color}</code></td>
  <td>${swatch(b.color)}</td>
  <td>${b.opacity}</td>
  <td>${b.lineWidth}px</td>
  <td><div class="demo-arrow" style="background:#2a2a2a"><div class="shaft" style="background:${b.color};opacity:${b.opacity};height:${Math.min(b.lineWidth, 12)}px"></div><div class="head" style="border-left-color:${b.color};opacity:${b.opacity}"></div></div></td>
</tr>`).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Colored arrows drawn on the board showing the engine\u2019s suggested moves. The primary best-move arrow is blue, secondary alternatives are grey, and threat/opponent arrows are red. Arrow thickness varies by how much better the move is.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Best move arrow \u2014 Game Analysis tool (board)</li><li>Secondary PV arrows \u2014 Game Analysis tool (board)</li><li>Threat mode arrows \u2014 Game Analysis tool (board)</li></ul></div></div>
</section>

<!-- 4. EVAL BAR -->
<section id="eval-bar">
<h2>4. Eval Bar</h2>
<div class="demo-row" style="gap:40px">
  <div style="text-align:center">
    <div class="eval-bar-demo">
      <div class="fill" style="height:65%"></div>
      <div class="tick" style="bottom:12.5%"></div>
      <div class="tick" style="bottom:25%"></div>
      <div class="tick" style="bottom:37.5%"></div>
      <div class="tick zero" style="bottom:50%"></div>
      <div class="tick" style="bottom:62.5%"></div>
      <div class="tick" style="bottom:75%"></div>
      <div class="tick" style="bottom:87.5%"></div>
      <div class="score" style="bottom:63%">+1.2</div>
    </div>
    <div style="font-size:12px;opacity:0.5;margin-top:4px">White +1.2</div>
  </div>
  <div style="text-align:center">
    <div class="eval-bar-demo">
      <div class="fill" style="height:50%"></div>
      <div class="tick zero" style="bottom:50%"></div>
      <div class="score" style="bottom:48%">0.0</div>
    </div>
    <div style="font-size:12px;opacity:0.5;margin-top:4px">Equal</div>
  </div>
  <div style="text-align:center">
    <div class="eval-bar-demo">
      <div class="fill" style="height:20%"></div>
      <div class="tick zero" style="bottom:50%"></div>
      <div class="score" style="bottom:18%">-3.5</div>
    </div>
    <div style="font-size:12px;opacity:0.5;margin-top:4px">Black winning</div>
  </div>
</div>
<table>
<thead><tr><th>Element</th><th>Color</th><th>Swatch</th></tr></thead>
<tbody>
<tr><td>Bar background (black territory)</td><td><code>${evalBarBg}</code></td><td>${swatch(evalBarBg)}</td></tr>
<tr><td>Bar fill (white territory)</td><td><code>${evalBarFill}</code></td><td>${swatch(evalBarFill)}</td></tr>
<tr><td>Tick marks</td><td><code>#888</code> at 35% opacity</td><td>${swatch('#888')}</td></tr>
<tr><td>Center tick (50%)</td><td><code>#aaa</code> at 70% opacity</td><td>${swatch('#aaa')}</td></tr>
<tr><td>Score label</td><td><code>#fff</code> with black text-shadow</td><td>${swatch('#fff')}</td></tr>
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> A narrow vertical bar beside the board showing who\u2019s winning. White territory fills from the bottom up in light grey; black territory is the dark background. A small score label sits at the boundary. Tick marks at 12.5% intervals show the scale.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Eval bar beside board \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- 5. W/D/L BARS -->
<section id="wdl">
<h2>5. Win / Draw / Loss Bars</h2>
<h3>Card variant</h3>
<div class="wdl-bar" style="width:400px">
  <div style="width:45%;background:${wdlCard.win};color:#8cb88c">45%</div>
  <div style="width:30%;background:${wdlCard.draw};color:#888">30%</div>
  <div style="width:25%;background:${wdlCard.loss};color:#b88c8c">25%</div>
</div>
<table>
<tr><td>Win</td><td><code>${wdlCard.win}</code></td><td>${swatch(wdlCard.win)}</td><td>Card WDL bar</td></tr>
<tr><td>Draw</td><td><code>${wdlCard.draw}</code></td><td>${swatch(wdlCard.draw)}</td><td>Card WDL bar</td></tr>
<tr><td>Loss</td><td><code>${wdlCard.loss}</code></td><td>${swatch(wdlCard.loss)}</td><td>Card WDL bar</td></tr>
</table>
<h3>Overview variant</h3>
<div class="wdl-bar" style="width:400px">
  <div style="width:52%;background:${wdlOverview.win};color:#fff">52%</div>
  <div style="width:28%;background:${wdlOverview.draw};color:#ddd">28%</div>
  <div style="width:20%;background:${wdlOverview.loss};color:#fff">20%</div>
</div>
<table>
<tr><td>Win</td><td><code>${wdlOverview.win}</code></td><td>${swatch(wdlOverview.win)}</td><td>Overview / mini WDL</td></tr>
<tr><td>Draw</td><td><code>${wdlOverview.draw}</code></td><td>${swatch(wdlOverview.draw)}</td><td>Overview / mini WDL</td></tr>
<tr><td>Loss</td><td><code>${wdlOverview.loss}</code></td><td>${swatch(wdlOverview.loss)}</td><td>Overview / mini WDL</td></tr>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Horizontal stacked bars showing win/draw/loss ratios for openings and opponents. Two color variants exist: darker for card views, lighter for overview/summary views.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Opening cards \u2014 Opponents tool</li><li>Opening overview panel \u2014 Opponents tool</li><li>Mini WDL in move tables \u2014 Opponents tool</li><li>Prep zone lines \u2014 Opponents tool</li></ul></div></div>
</section>

<!-- 6. BUTTONS -->
<section id="buttons">
<h2>6. Buttons</h2>
<div class="demo-row">
${buttonStyles.map(b => `  <button class="demo-btn" style="background:${b.bg};color:${b.color};border-color:#303030" title="${esc(b.cls)}">${esc(b.name)}</button>`).join('\n')}
</div>
<table>
<thead><tr><th>Name</th><th>Class</th><th>Background</th><th>Color</th><th>Hover BG</th><th>Radius</th><th>Source</th></tr></thead>
<tbody>
${buttonStyles.map(b => `<tr>
  <td>${esc(b.name)}</td>
  <td><code>${esc(b.cls)}</code></td>
  <td>${swatch(b.bg === 'transparent' ? '#1a1a1a' : b.bg, 16)} <code>${b.bg}</code></td>
  <td>${swatch(b.color, 16)} <code>${b.color}</code></td>
  <td><code>${b.hoverBg}</code></td>
  <td>${b.radius}</td>
  <td><code>${b.source}</code></td>
</tr>`).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Different button styles for different contexts. Flat transparent buttons for board controls, solid buttons for primary actions, green-tinted buttons for import actions. All share the same border-radius and hover behavior.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Board navigation controls \u2014 Game Analysis tool</li><li>Action menu buttons \u2014 Game Analysis tool</li><li>Puzzle controls (Next, Hint, Retry) \u2014 Puzzles tool</li><li>Import button \u2014 header</li><li>LFYM action buttons \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- 7. TOGGLES -->
<section id="toggles">
<h2>7. Toggle Switches</h2>
<div class="demo-row" style="gap:40px">
  <div style="text-align:center">
    <div class="demo-toggle" style="background:${toggleOff.bg}"><div class="knob" style="background:${toggleOff.knob};left:2px"></div></div>
    <div style="font-size:12px;opacity:0.5;margin-top:4px">OFF</div>
  </div>
  <div style="text-align:center">
    <div class="demo-toggle" style="background:${toggleOn.bg}"><div class="knob" style="background:${toggleOn.knob};left:18px"></div></div>
    <div style="font-size:12px;opacity:0.5;margin-top:4px">ON</div>
  </div>
</div>
<table>
<tr><td>OFF background</td><td><code>${toggleOff.bg}</code></td><td>${swatch(toggleOff.bg)}</td></tr>
<tr><td>OFF knob</td><td><code>${toggleOff.knob}</code></td><td>${swatch(toggleOff.knob)}</td></tr>
<tr><td>ON background</td><td><code>${toggleOn.bg}</code></td><td>${swatch(toggleOn.bg)}</td></tr>
<tr><td>ON knob</td><td><code>${toggleOn.knob}</code></td><td>${swatch(toggleOn.knob)}</td></tr>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Pill-shaped toggle switches used for on/off settings. Green when on, grey when off. Used in the settings panel, retro config, and engine controls.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Engine toggle \u2014 Game Analysis tool</li><li>Retro config toggles \u2014 Game Analysis tool (LFYM settings)</li><li>Settings panel toggles \u2014 all tools</li></ul></div></div>
</section>

<!-- 8. INPUTS -->
<section id="inputs">
<h2>8. Input Fields</h2>
<div class="demo-row" style="flex-direction:column;align-items:flex-start;gap:12px">
  <input class="demo-input" style="background:#111;color:#e0e0e0;border-color:#383838" value="Username" readonly>
  <input type="range" style="width:200px" value="60">
  <textarea style="background:#111;border:1px solid #333;color:#ccc;font-family:monospace;padding:8px;border-radius:6px;width:300px;height:60px;resize:none" readonly>1. e4 e5 2. Nf3 Nc6</textarea>
</div>
<table>
<thead><tr><th>Type</th><th>Background</th><th>Border</th><th>Focus Border</th></tr></thead>
<tbody>
${inputStyles.map(s => `<tr><td>${esc(s.name)}</td><td><code>${s.bg}</code></td><td><code>${s.border}</code></td><td><code>${s.focusBorder || s.focusBorder || '\u2014'}</code></td></tr>`).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Dark-themed input fields with green focus highlights. Text inputs for usernames, range sliders for thresholds, and monospace textareas for PGN paste.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Username input \u2014 header import</li><li>PGN paste textarea \u2014 header import</li><li>Threshold sliders \u2014 LFYM settings, engine settings</li><li>Depth/time controls \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- 9. NAVIGATION CONTROLS -->
<section id="nav">
<h2>9. Board Navigation</h2>
<div class="demo-row">
  <div class="nav-demo">
    <button>\u23ee</button>
    <button>\u25c0</button>
    <button>\u25b6</button>
    <button>\u23ed</button>
  </div>
</div>
<table>
<tr><td>Container</td><td>bg <code>#1a1a1a</code>, border <code>#2a2a2a</code>, radius <code>8px</code></td></tr>
<tr><td>Button default</td><td>transparent, color <code>#bbb</code></td></tr>
<tr><td>Button hover</td><td>bg <code>rgba(56,147,232,0.15)</code>, color <code>#e0e0e0</code></td></tr>
<tr><td>Button active</td><td>bg <code>rgba(56,147,232,0.22)</code>, color <code>#9cc9f5</code></td></tr>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Arrow buttons below the board for stepping through moves: first, previous, next, last. Flat button style with blue hover tints.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Jump buttons below board \u2014 Game Analysis tool</li><li>Move navigation \u2014 Puzzles tool</li></ul></div></div>
</section>

<!-- 10. TAB NAVIGATION -->
<section id="tabs">
<h2>10. Tab Navigation</h2>
<div class="demo-row">
  <div class="tab-demo">
    <a style="color:${navColors.active};background:rgba(255,255,255,0.05)">Analysis</a>
    <a style="color:${navColors.default}">Puzzles</a>
    <a style="color:${navColors.default}">Opponents</a>
    <a style="color:${navColors.default}">Stats</a>
  </div>
</div>
<table>
<tr><td>Default</td><td>color <code>${navColors.default}</code></td><td>${swatch(navColors.default)}</td></tr>
<tr><td>Hover</td><td>color <code>${navColors.hover}</code>, bg <code>${navColors.hoverBg}</code></td><td>${swatch(navColors.hover)}</td></tr>
<tr><td>Active</td><td>color <code>${navColors.active}</code></td><td>${swatch(navColors.active)}</td></tr>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> The top navigation bar with tool tabs (Analysis, Puzzles, Opponents, Stats, Admin). Muted grey by default, white when active, subtle hover highlight.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Header navigation \u2014 all tools</li><li>Analysis tool tabs \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- 11. MOVE LIST -->
<section id="move-list">
<h2>11. Move List</h2>
<div class="demo-row">
  <div class="move-demo">
    <div class="idx">13.</div>
    <div class="mv">Nxf3</div>
    <div class="mv">d5</div>
  </div>
  <div class="move-demo">
    <div class="idx">14.</div>
    <div class="mv">e5</div>
    <div class="mv">Ne4</div>
  </div>
  <div class="move-demo">
    <div class="idx">15.</div>
    <div class="mv active">Bd3 <span style="color:${glyphColors['?!'] || '#56b4e9'};font-weight:700">?!</span></div>
    <div class="mv">f5</div>
  </div>
  <div class="move-demo">
    <div class="idx">16.</div>
    <div class="mv">Ng5 <span style="color:${glyphColors['??'] || 'hsl(0,69%,60%)'};font-weight:700">??</span></div>
    <div class="mv">Nxg5</div>
  </div>
</div>
<h3>Glyph Colors (from <code>moveList.ts</code>)</h3>
<table>
<thead><tr><th>Glyph</th><th>Name</th><th>Color</th><th>Swatch</th></tr></thead>
<tbody>
${Object.entries(glyphColors).map(([sym, color]) => {
  const names = { '??': 'Blunder', '?': 'Mistake', '?!': 'Inaccuracy', '!!': 'Brilliant', '!': 'Good', '!?': 'Interesting', 'M?!': 'Missed mate' };
  return `<tr><td style="font-weight:700;font-size:18px;color:${color}">${esc(sym)}</td><td>${esc(names[sym] || sym)}</td><td><code>${esc(color)}</code></td><td>${swatch(color)}</td></tr>`;
}).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> The column of moves beside the board. Move numbers on the left, white and black moves in columns. The current move is highlighted with a blue tint. Glyph symbols appear after annotated moves in their severity color.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Move list column \u2014 Game Analysis tool</li><li>Puzzle move list \u2014 Puzzles tool</li></ul></div></div>
</section>

<!-- 12. BADGES -->
<section id="badges">
<h2>12. Badges &amp; Tags</h2>
<div class="demo-row">
${badgeColors.map(b => `  <span class="badge-demo" style="color:${b.color}">${esc(b.label)}</span>`).join('\n')}
  <span class="badge-demo" style="color:#888">NEW</span>
</div>
<table>
<thead><tr><th>Badge</th><th>Color</th><th>Swatch</th><th>Source</th></tr></thead>
<tbody>
${badgeColors.map(b => `<tr><td><code>${esc(b.cls)}</code> \u2014 ${esc(b.label)}</td><td><code>${b.color}</code></td><td>${swatch(b.color)}</td><td><code>${esc(b.source)}</code></td></tr>`).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Small colored labels next to games, puzzles, and openings that convey status at a glance \u2014 analyzed, missed mate, warnings, etc.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Game list badges \u2014 Games tab</li><li>Puzzle quality badges \u2014 Puzzles tool</li><li>Study tags \u2014 Study tool</li><li>Filter badges \u2014 Opponents tool</li></ul></div></div>
</section>

<!-- 13. LOADING STATES -->
<section id="loading">
<h2>13. Loading States</h2>
<div class="demo-row" style="flex-direction:column;align-items:flex-start;gap:16px">
  <div>
    <div style="font-size:12px;opacity:0.5;margin-bottom:4px">Loading bar</div>
    <div class="loading-bar-demo"><div class="fill" style="width:67%">67%</div></div>
  </div>
  <div>
    <div style="font-size:12px;opacity:0.5;margin-bottom:4px">Percentage counter</div>
    <div style="font-size:3.5rem;color:${loadingBar.pctColor};font-family:monospace;letter-spacing:-2px">67%</div>
  </div>
</div>
<table>
<tr><td>Bar background</td><td><code>${loadingBar.bg}</code></td><td>${swatch(loadingBar.bg)}</td></tr>
<tr><td>Bar fill start</td><td><code>${loadingBar.fillStart}</code></td><td>${swatch(loadingBar.fillStart)}</td></tr>
<tr><td>Bar fill end</td><td><code>${loadingBar.fillEnd}</code></td><td>${swatch(loadingBar.fillEnd)}</td></tr>
<tr><td>Percentage text</td><td><code>${loadingBar.pctColor}</code></td><td>${swatch(loadingBar.pctColor)}</td></tr>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary"><strong>What the user sees:</strong> Progress indicators during data loading. A green gradient loading bar with percentage text, a large percentage counter in monospace, and a pulsing transfer animation during sync operations.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Game import progress \u2014 header</li><li>Opening data loading \u2014 Opponents tool</li><li>Sync transfer animation \u2014 Opponents tool</li><li>Eval progress bar \u2014 Game Analysis tool (LFYM eval state)</li></ul></div></div>
</section>

</div><!-- .content -->

<div style="text-align:center;padding:20px;font-size:13px;opacity:0.4">
  Generated from live source files. <a href="feedback-lookbook.html">Feedback Lookbook</a> | <a href="../docs/FEEDBACK_STYLE_GUIDE.md">Style Guide</a>
</div>

</body>
</html>`;

writeFileSync(outPath, html, 'utf8');
console.log(`Generated: ${outPath}`);
