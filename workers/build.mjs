import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = (await readdir(root)).filter((name) => /^\d{4}\.json$/.test(name)).sort();
if (!files.length) throw new Error('No yearly holiday JSON files found');
const holidays = {};
for (const file of files) {
  const data = JSON.parse(await readFile(new URL(file, root), 'utf8'));
  const year = file.slice(0, 4);
  if (data.year !== Number(year) || !Array.isArray(data.papers) ||
      !data.papers.every((paper) => typeof paper === 'string') ||
      !Array.isArray(data.days) || !data.days.every((day) =>
        typeof day.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
        typeof day.isOffDay === 'boolean')) {
    throw new Error(`Invalid holiday data: ${file}`);
  }
  holidays[year] = data;
}
const schema = JSON.parse(await readFile(new URL('schema.json', root), 'utf8'));
await mkdir(new URL('src/generated/', import.meta.url), { recursive: true });
await writeFile(new URL('src/generated/data.mjs', import.meta.url),
  `// Generated from repository JSON; do not edit.\nexport const holidays = ${JSON.stringify(holidays)};\nexport const schema = ${JSON.stringify(schema)};\n`);
console.log(`Bundled ${files.length} years (${files[0]} – ${files.at(-1)})`);
