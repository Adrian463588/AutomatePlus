import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = join(root, 'apps', 'desktop', 'src');
const findings = [];

function collect(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return /\.tsx$/u.test(entry.name) ? [path] : [];
  });
}

function openingButtonTags(source) {
  const tags = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<button', cursor);
    if (start < 0 || !/\s|>/u.test(source[start + '<button'.length] ?? '')) break;
    let index = start + '<button'.length;
    let quote;
    let escaped = false;
    let expressionDepth = 0;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = undefined;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '{') {
        expressionDepth += 1;
        continue;
      }
      if (character === '}' && expressionDepth > 0) {
        expressionDepth -= 1;
        continue;
      }
      if (character === '>' && expressionDepth === 0) {
        tags.push(source.slice(start + '<button'.length, index));
        cursor = index + 1;
        break;
      }
    }
    if (index >= source.length) break;
  }
  return tags;
}

for (const file of collect(sourceRoot)) {
  const source = readFileSync(file, 'utf8');
  const relativePath = relative(root, file).replaceAll('\\', '/');
  if (/\bWinUI\b|native WinUI/iu.test(source)) findings.push(`${relativePath}: stale WinUI runtime wording`);
  if (/onClick=\{\(\)\s*=>\s*\{\s*\}\}/u.test(source)) findings.push(`${relativePath}: no-op button handler`);
  for (const attributes of openingButtonTags(source)) {
    if (!/\bonClick\s*=/u.test(attributes) && !/\btype\s*=\s*["']submit["']/u.test(attributes)) {
      findings.push(`${relativePath}: button without an action handler`);
    }
    if (/\bdisabled\s*=/u.test(attributes) && !/\b(?:title|aria-describedby|aria-label)\s*=/u.test(attributes)) {
      findings.push(`${relativePath}: disabled button without an accessible explanation`);
    }
  }
}

const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');
for (const required of [
  'min-height: 3rem',
  '@media (prefers-reduced-motion: reduce)',
  '@media (forced-colors: active)',
  '@media (max-width: 600px)',
  '@media (max-width: 900px)',
]) {
  if (!css.includes(required)) findings.push(`index.css: missing ${required}`);
}

if (findings.length) {
  console.error('UI contract verification failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`UI contract verification passed: ${collect(sourceRoot).length} TSX files and responsive/a11y invariants checked`);
