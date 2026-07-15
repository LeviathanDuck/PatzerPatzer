import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_ENTRYPOINT = 'public/index.html';

function attributesOf(tag) {
  const attributes = new Map();
  const body = tag.replace(/^<\s*[\w:-]+\b/, '').replace(/\/?>\s*$/, '');
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of body.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function assetBuildId(value, assetPath) {
  const match = new RegExp(`^${assetPath.replaceAll('.', '\\.')}\\?v=(.*)$`).exec(value);
  return match ? match[1] : null;
}

export function inspectPublicEntrypointHtml(html) {
  const violations = [];
  const tags = [...html.matchAll(/<[a-z][^>]*>/gi)].map(match => ({
    name: /^<\s*([\w:-]+)/.exec(match[0])?.[1].toLowerCase(),
    attributes: attributesOf(match[0]),
  }));

  const stylesheetIds = tags
    .filter(({ name, attributes }) => {
      const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/);
      return name === 'link' && rel.includes('stylesheet');
    })
    .map(({ attributes }) => assetBuildId(attributes.get('href') ?? '', '/css/main.css'))
    .filter(id => id !== null);
  const appRoots = tags.filter(({ attributes }) => attributes.get('id') === 'app');
  const moduleScriptIds = tags
    .filter(({ name, attributes }) => (
      name === 'script'
      && (attributes.get('type') ?? '').toLowerCase() === 'module'
    ))
    .map(({ attributes }) => assetBuildId(attributes.get('src') ?? '', '/js/main.js'))
    .filter(id => id !== null);
  const conflictMarkerCount = html
    .split(/\r?\n/)
    .filter(line => /^\s*(?:<<<<<<<|=======|>>>>>>>)/.test(line))
    .length;

  if (conflictMarkerCount > 0) {
    violations.push(`conflict-marker lines: expected 0, found ${conflictMarkerCount}`);
  }
  if (stylesheetIds.length !== 1) {
    violations.push(`stylesheet cardinality: expected 1, found ${stylesheetIds.length}`);
  }
  if (appRoots.length !== 1) {
    violations.push(`app-root cardinality: expected 1, found ${appRoots.length}`);
  }
  if (moduleScriptIds.length !== 1) {
    violations.push(`module-script cardinality: expected 1, found ${moduleScriptIds.length}`);
  }

  const stylesheetBuildId = stylesheetIds.length === 1 ? stylesheetIds[0] : null;
  const scriptBuildId = moduleScriptIds.length === 1 ? moduleScriptIds[0] : null;
  if (
    stylesheetBuildId !== null
    && scriptBuildId !== null
    && (stylesheetBuildId.length === 0 || scriptBuildId.length === 0)
  ) {
    violations.push('cache-bust ids: expected identical non-empty values');
  } else if (
    stylesheetBuildId !== null
    && scriptBuildId !== null
    && stylesheetBuildId !== scriptBuildId
  ) {
    violations.push(`cache-bust ids: stylesheet "${stylesheetBuildId}" does not match script "${scriptBuildId}"`);
  }

  return {
    violations,
    stylesheetCount: stylesheetIds.length,
    appRootCount: appRoots.length,
    moduleScriptCount: moduleScriptIds.length,
    stylesheetBuildId,
    scriptBuildId,
  };
}

export function assertPublicEntrypointIntegrity(filePath = DEFAULT_ENTRYPOINT) {
  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`[public-entrypoint-integrity] unable to read ${filePath}: ${reason}`);
  }

  const summary = inspectPublicEntrypointHtml(html);
  if (summary.violations.length > 0) {
    throw new Error(
      `[public-entrypoint-integrity] ${filePath} failed:\n- ${summary.violations.join('\n- ')}`,
    );
  }
  return summary;
}

function fixtureHtml({ buildId = 'fixture-123', stylesheet = true, appRoot = true, script = true } = {}) {
  return [
    '<!doctype html>',
    '<html><head>',
    stylesheet ? `<link href = '/css/main.css?v=${buildId}' data-fixture rel = 'preload stylesheet'>` : '',
    '</head><body>',
    appRoot ? '<main class="shell" id = "app"></main>' : '',
    script ? `<script src = '/js/main.js?v=${buildId}' defer type = 'MODULE'></script>` : '',
    '</body></html>',
  ].join('\n');
}

function assertFixture(name, html, expectedViolation = null) {
  const summary = inspectPublicEntrypointHtml(html);
  if (expectedViolation === null && summary.violations.length > 0) {
    throw new Error(`fixture "${name}" unexpectedly failed: ${summary.violations.join('; ')}`);
  }
  if (
    expectedViolation !== null
    && !summary.violations.some(violation => violation.includes(expectedViolation))
  ) {
    throw new Error(
      `fixture "${name}" did not report "${expectedViolation}": ${summary.violations.join('; ') || 'no violations'}`,
    );
  }
}

function runFixtureMatrix() {
  const valid = fixtureHtml();
  const tail = valid.match(/<link[^>]*>[\s\S]*<\/script>/)?.[0] ?? '';

  assertFixture('formatting-varied valid document', valid);
  assertFixture('indented conflict marker', valid.replace('<html><head>', '<html><head>\n  <<<<<<< HEAD'), 'conflict-marker');
  assertFixture('duplicate tail', `${valid}\n${tail}`, 'cardinality');
  assertFixture('missing stylesheet', fixtureHtml({ stylesheet: false }), 'stylesheet cardinality');
  assertFixture('missing app root', fixtureHtml({ appRoot: false }), 'app-root cardinality');
  assertFixture('missing module script', fixtureHtml({ script: false }), 'module-script cardinality');
  assertFixture('empty cache-bust id', fixtureHtml({ buildId: '' }), 'identical non-empty');
  assertFixture(
    'mismatched cache-bust ids',
    fixtureHtml().replace('/js/main.js?v=fixture-123', '/js/main.js?v=fixture-456'),
    'does not match',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runFixtureMatrix();
    console.log('[public-entrypoint-integrity] fixture matrix passed (8 cases)');
    const summary = assertPublicEntrypointIntegrity();
    console.log(
      `[public-entrypoint-integrity] public/index.html passed: stylesheet=${summary.stylesheetCount} appRoot=${summary.appRootCount} moduleScript=${summary.moduleScriptCount} buildId=${summary.stylesheetBuildId}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
