import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep deployment bindings and environment overrides intact, but point every
// deployment at the uploaded Worker bytes and remove source-only build hooks.
export function candidateConfig(source) {
	let section = '';
	let mainCount = 0;
	const output = [];
	for (const line of source.split(/\r?\n/)) {
		const header = line.match(/^\s*\[{1,2}\s*([^\]]+?)\s*\]{1,2}\s*(?:#.*)?$/);
		if (header) section = header[1];
		if (/^(?:env\.[^.]+\.)?build(?:\.|$)/.test(section)) continue;
		const deployment = section === '' || /^env\.[^.]+$/.test(section);
		if (deployment && /^\s*no_bundle\s*=/.test(line)) continue;
		if (deployment && /^\s*main\s*=/.test(line)) {
			if (!section) mainCount++;
			output.push('main = "bundle/index.js"', 'no_bundle = true');
		} else {
			output.push(line);
		}
	}
	if (mainCount !== 1) throw new Error('Expected exactly one root Worker entry');
	return output.join('\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const [source, destination] = process.argv.slice(2);
	if (!source || !destination) throw new Error('Usage: node scripts/candidate-config.mjs <source> <destination>');
	await writeFile(destination, candidateConfig(await readFile(source, 'utf8')), { flag: 'wx' });
}
