#!/usr/bin/env node
// Generate docs/patzer-lookbook.html — a unified visual reference combining
// the feedback lookbook and general UI lookbook into a single tabbed page.
//
// Usage: npm run lookbook:generate
// (runs via tsx so TypeScript imports from severity.ts work)
//
// This script runs both sub-generators and wraps their output in a tabbed container.

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outPath = resolve(root, 'docs', 'patzer-lookbook.html');

// Step 1: Generate both sub-lookbooks into temporary locations
const feedbackPath = resolve(root, 'docs', 'feedback-lookbook.html');
const uiPath = resolve(root, 'docs', 'ui-lookbook.html');

console.log('Generating feedback lookbook...');
execSync('npx tsx scripts/generate-feedback-lookbook.mjs', { cwd: root, stdio: 'pipe' });

console.log('Generating UI lookbook...');
execSync('node scripts/generate-ui-lookbook.mjs', { cwd: root, stdio: 'pipe' });

// Step 2: Extract <body> content from each
function extractBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  if (!bodyMatch) return html;
  let body = bodyMatch[1];
  // Remove their individual headers — find the closing </div> that matches the
  // opening <div class="header"> by counting nesting depth.
  const headerStart = body.indexOf('<div class="header">');
  if (headerStart >= 0) {
    let depth = 0;
    let i = headerStart;
    while (i < body.length) {
      if (body.slice(i, i + 4) === '<div') { depth++; i += 4; }
      else if (body.slice(i, i + 6) === '</div>') {
        depth--;
        if (depth === 0) { body = body.slice(0, headerStart) + body.slice(i + 6); break; }
        i += 6;
      } else { i++; }
    }
  }
  // Remove trailing footer-like divs
  body = body.replace(/<div style="text-align:center[^"]*">[\s\S]*?<\/div>\s*$/, '');
  // Remove save bar and save modal (feedback-specific, handled by merged page)
  return body.trim();
}

function extractStyles(html) {
  const styles = [];
  const re = /<style>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    styles.push(m[1]);
  }
  return styles.join('\n');
}

const feedbackHtml = readFileSync(feedbackPath, 'utf8');
const uiHtml = readFileSync(uiPath, 'utf8');

const feedbackBody = extractBody(feedbackHtml);
const uiBody = extractBody(uiHtml);
const feedbackStyles = extractStyles(feedbackHtml);
const uiStyles = extractStyles(uiHtml);

// Step 3: Build unified page
const merged = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patzer Pro \u2014 Lookbook</title>
<style>
/* Shared base */
:root { --bg: #1a1a1a; --text: #e8e8e8; --border: #3a3a3a; --accent: #629924; }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; line-height: 1.6; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Top header */
.lookbook-header { position: sticky; top: 0; z-index: 200; background: #111; border-bottom: 1px solid var(--border); padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.lookbook-header h1 { margin: 0; font-size: 22px; font-weight: 600; white-space: nowrap; }

/* Tab bar */
.tab-bar { display: flex; gap: 4px; }
.tab-bar button { background: var(--border); color: var(--text); border: 1px solid #555; border-radius: 6px 6px 0 0; padding: 6px 18px; cursor: pointer; font-size: 15px; font-family: inherit; border-bottom: none; transition: all 0.15s; }
.tab-bar button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.tab-bar button:hover:not(.active) { background: #444; }

/* Tab content */
.tab-content { display: none; }
.tab-content.active { display: block; }

/* Regen button */
.lookbook-regen { margin-left: auto; position: relative; }
.lookbook-regen button { background: var(--border); color: var(--text); border: 1px solid #555; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 14px; }
.lookbook-regen button:hover { border-color: var(--accent); }
.regen-tooltip { display: none; position: absolute; right: 0; top: calc(100% + 8px); background: #222; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; width: 320px; font-size: 13px; line-height: 1.5; z-index: 300; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
.regen-tooltip.visible { display: block; }
.regen-tooltip code { background: #333; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
.regen-tooltip p { margin: 0 0 8px; }
.regen-tooltip p:last-child { margin: 0; }

${feedbackStyles}
${uiStyles}
</style>
</head>
<body>

<div class="lookbook-header">
  <h1>Patzer Lookbook</h1>
  <div class="tab-bar">
    <button class="active" onclick="switchTab('feedback')">Feedback</button>
    <button onclick="switchTab('ui')">General UI</button>
  </div>
  <div class="tone-toggle" id="tone-toggle">
    <span>Harshness:</span>
    <button class="active" data-tone="standard" onclick="setTone('standard')">Standard</button>
    <button data-tone="harsh" onclick="setTone('harsh')">Harsh</button>
  </div>
  <div class="lookbook-regen">
    <button onclick="this.nextElementSibling.classList.toggle('visible')">Regenerate</button>
    <div class="regen-tooltip">
      <p>This is a static snapshot. To regenerate after editing source files:</p>
      <p><code>npm run lookbook:generate</code></p>
      <p style="opacity:0.6">Then refresh this page to see the changes.</p>
    </div>
  </div>
</div>

<div class="tab-content active" id="tab-feedback">
${feedbackBody}
</div>

<div class="tab-content" id="tab-ui">
${uiBody}
</div>

<script>
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-bar button').forEach(btn => btn.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('.tab-bar button[onclick*="' + tab + '"]').classList.add('active');
  // Close regen tooltip
  document.querySelector('.regen-tooltip')?.classList.remove('visible');
}
// Close regen tooltip on outside click
document.addEventListener('click', function(e) {
  const hint = document.querySelector('.lookbook-regen');
  if (hint && !hint.contains(e.target)) {
    document.querySelector('.regen-tooltip')?.classList.remove('visible');
  }
});
</script>
</body>
</html>`;

writeFileSync(outPath, merged, 'utf8');

// Clean up intermediary files — the sub-generators write these but only the merged
// output should persist.
try { unlinkSync(feedbackPath); } catch {}
try { unlinkSync(uiPath); } catch {}

console.log(`Generated: ${outPath}`);
