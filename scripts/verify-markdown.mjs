import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = ['AGENTS.md', 'CLAUDE.md', 'DESIGN.md', 'PRD.md', 'README.md'];
const failures = [];
const separatorCell = /^:?-{3,}:?$/u;

function columnCount(line) {
  const normalized = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  return normalized.split('|').length;
}

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/u);
  if (!content.endsWith('\n')) failures.push(`${file}: missing final newline`);

  let previousHeadingLevel = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^(#{1,6})\s+\S/u.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) {
        failures.push(`${file}:${index + 1}: heading level jumps from ${previousHeadingLevel} to ${level}`);
      }
      previousHeadingLevel = level;
    }

    const linkPattern = /\[[^\]]+\]\(([^)]+)\)/gu;
    for (const match of line.matchAll(linkPattern)) {
      const target = match[1].split('#', 1)[0].trim();
      if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) continue;
      if (!existsSync(resolve(dirname(file), target))) failures.push(`${file}:${index + 1}: broken local link ${target}`);
    }

    if (line.includes('|') && index + 1 < lines.length && lines[index + 1].includes('|')) {
      const next = lines[index + 1].trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim());
      if (next.length > 1 && next.every((cell) => separatorCell.test(cell))) {
        const columns = columnCount(line);
        if (columns !== next.length) failures.push(`${file}:${index + 1}: table header has ${columns} columns, separator has ${next.length}`);
      }
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Markdown verification failed:\n${failures.join('\n')}`);
}
process.stdout.write(`markdown: ${files.length} files passed heading, table, link, and newline checks\n`);
