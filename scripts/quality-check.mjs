import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const mode = process.argv[2];
const repositoryRoot = process.cwd();
const sourceRoots = [path.join('frontend', 'packages'), path.join('frontend', 'src'), path.join('frontend', 'sidecar', 'src'), 'scripts'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mjs']);

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else if (sourceExtensions.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) files.push(fullPath);
  }
  return files;
}

const files = sourceRoots.flatMap((root) => collectFiles(path.join(repositoryRoot, root)));
const failures = [];

for (const file of files) {
  const relative = path.relative(repositoryRoot, file);
  const content = fs.readFileSync(file, 'utf8');
  if (/[ \t]+$/m.test(content)) failures.push(`${relative}: trailing whitespace`);
  if (!content.endsWith('\n')) failures.push(`${relative}: missing final newline`);
  const isQualityScript = relative === path.join('scripts', 'quality-check.mjs');
  if (mode === 'lint' && !isQualityScript && /\bTODO\b|\bFIXME\b/.test(content)) {
    failures.push(`${relative}: unresolved TODO/FIXME marker`);
  }
  if (mode === 'lint' && !isQualityScript && /Math\.random\s*\(/.test(content)) {
    failures.push(`${relative}: synthetic randomness is not allowed in runtime or metrics code`);
  }
}

if (!['lint', 'format:check'].includes(mode)) {
  console.error('Usage: node scripts/quality-check.mjs lint|format:check');
  process.exit(2);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`${mode}: ${files.length} source files checked`);
