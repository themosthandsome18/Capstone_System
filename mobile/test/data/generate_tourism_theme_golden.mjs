// Regenerates tourism_theme_golden.json: what the web's own
// frontend/src/tourism/theme/deriveTourismTheme.js returns, run in Node.
// The Dart port (lib/theme/brand_theme.dart) is tested against this file, so
// the two cannot drift apart unnoticed.
//
//   node mobile/test/data/generate_tourism_theme_golden.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, '..', '..', '..', 'frontend', 'src', 'tourism', 'theme', 'deriveTourismTheme.js'),
  'utf8',
);
const { deriveTourismTheme } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

const colors = ['#EF7C1F', '#236BFB', '#28A84A', '#2FA34A', '#FFF200', '#CB0606'];
const out = {};
for (const color of colors) out[color] = deriveTourismTheme(color);
out['invalid:#FFF'] = deriveTourismTheme('#FFF');

writeFileSync(join(here, 'tourism_theme_golden.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', Object.keys(out).length, 'palettes');
