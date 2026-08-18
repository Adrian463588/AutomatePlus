import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = join(root, 'frontend', 'src');
const findings = [];

function collect(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return /\.(?:tsx?|css)$/u.test(entry.name) ? [path] : [];
  });
}

const cssPath = join(sourceRoot, 'index.css');
const css = readFileSync(cssPath, 'utf8');
const requiredTokens = [
  '--ap-canvas:',
  '--ap-surface:',
  '--ap-border:',
  '--ap-accent:',
  '--ap-radius-sm:',
  '--ap-radius-md:',
  '--ap-motion-fast:',
  '--ap-motion-normal:',
  'color-scheme: dark',
  '@media (prefers-reduced-motion: reduce)',
  '@media (forced-colors: active)',
];
for (const token of requiredTokens) {
  if (!css.includes(token)) findings.push(`frontend/src/index.css: missing ${token}`);
}

const forbiddenPatterns = [
  { label: 'indigo/purple accent', expression: /\b(?:indigo|violet|purple)-\d/u },
  { label: 'gradient decoration', expression: /(?:linear|radial|conic)-gradient\s*\(/u },
  { label: 'glass decoration', expression: /backdrop-filter|backdrop-blur/u },
  { label: 'oversized card radius', expression: /rounded-(?:2xl|3xl|full)/u },
  { label: 'decorative large shadow', expression: /shadow-(?:lg|xl|2xl)/u },
];

for (const filePath of collect(sourceRoot)) {
  const relativePath = relative(root, filePath).replaceAll('\\', '/');
  if (relativePath.includes('/tests/') || relativePath.includes('.test.')) continue;
  const source = readFileSync(filePath, 'utf8');
  for (const rule of forbiddenPatterns) {
    const match = rule.expression.exec(source);
    if (match) findings.push(`${relativePath}: ${rule.label} (${match[0]})`);
  }
}

const primitivesPath = join(sourceRoot, 'components', 'common', 'UiPrimitives.tsx');
const primitives = readFileSync(primitivesPath, 'utf8');
for (const name of ['Button', 'Field', 'Select', 'StatusMessage', 'Dialog', 'ActionToolbar', 'EmptyState', 'RuntimeStatus']) {
  if (!new RegExp(`export const ${name}\\b`, 'u').test(primitives)) findings.push(`UiPrimitives.tsx: missing ${name}`);
}

const app = readFileSync(join(sourceRoot, 'App.tsx'), 'utf8');
if (!app.includes("workspace-layout--full") || !app.includes("data-layout")) findings.push('App.tsx: editor/full-workspace layout contract missing');
const runtime = readFileSync(join(sourceRoot, 'components', 'runtime', 'RuntimeManagerPanel.tsx'), 'utf8');
if (!runtime.includes('runtime-pack-table') || !runtime.includes('Not evaluated')) findings.push('RuntimeManagerPanel.tsx: truthful compact runtime catalog contract missing');
const setupGuide = readFileSync(join(sourceRoot, 'components', 'common', 'NativeSetupGuide.tsx'), 'utf8');
if (!setupGuide.includes('role="dialog"') || !setupGuide.includes('Open native setup guide')) findings.push('NativeSetupGuide.tsx: controlled setup dialog contract missing');

if (findings.length > 0) {
  console.error('AntiSlop verification failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`AntiSlop verification passed: ${collect(sourceRoot).length} source files use the Precision Workbench contract.`);
