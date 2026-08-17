import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const productionRoots = ['apps/desktop/src', 'packages', 'src'];
const ignoredDirectoryNames = new Set(['dist', 'node_modules', 'bin', 'obj', 'coverage']);

const rules = [
  { name: 'seeded production data', expression: /seedInitialData|Default Workspace Project|Web E-Commerce Login Flow/u },
  { name: 'invented targets', expression: /127\.0\.0\.1:4173|com\.example\.app|com\.automateplus\.shop/u },
  { name: 'invented identities or secrets', expression: /qa@example\.test|user@example\.test|API_PASSWORD/u },
  { name: 'fabricated code/status output', expression: /Select or record a test session|No code generated|Code generation error/u },
  { name: 'generator fallback output', expression: /50%,50%|assertVisible\s*:\s*["']true["']|(^|\n)\s*(#|\/\/)+\s*Action:/u },
];

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(entryPath));
    else if (/\.(?:[cm]?js|tsx?|cs|xaml)$/u.test(entry.name)) files.push(entryPath);
  }
  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

const findings = [];
for (const relativeRoot of productionRoots) {
  for (const filePath of collectFiles(join(root, relativeRoot))) {
    const relativePath = relative(root, filePath).replaceAll('\\', '/');
    if (relativePath.includes('/tests/') || relativePath.includes('.test.')) continue;
    const source = readFileSync(filePath, 'utf8');
    for (const rule of rules) {
      if (rule.name === 'generator fallback output' && relativePath === 'packages/generators/src/base.generator.ts') continue;
      const match = rule.expression.exec(source);
      rule.expression.lastIndex = 0;
      if (match) findings.push(`${relativePath}:${lineNumber(source, match.index)} ${rule.name}`);
    }
  }
}

for (const filePath of collectFiles(join(root, 'apps/desktop/src'))) {
  const relativePath = relative(root, filePath).replaceAll('\\', '/');
  const source = readFileSync(filePath, 'utf8');
  const match = /\bplaceholder\s*=/u.exec(source);
  if (match) findings.push(`${relativePath}:${lineNumber(source, match.index)} placeholder attribute`);
}

if (findings.length > 0) {
  console.error('Authenticity scan failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log('Authenticity scan passed: no forbidden production seeds, fabricated targets, placeholder UI attributes, or generator fallbacks found.');
}
