// Build: src/ + data/ + fonts/ → dist/index.html (vollständige Seite) und dist/artifact.html (Fragment für claude.ai).
// Alles wird eingebettet: App-Code, Solver-Daten, Schriften. Die Seite stellt keine Anfragen an Dritte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const r = p => path.join(ROOT, p);
const read = p => fs.readFileSync(r(p), 'utf8');

const { outputFiles } = await esbuild.build({
  entryPoints: [r('src/app/main.js')], bundle: true, write: false, format: 'iife',
  platform: 'browser', target: ['es2020'], charset: 'utf8', legalComments: 'none',
});
const app = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const font = (family, file, weight, style = 'normal') =>
  `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(r('fonts/' + file)).toString('base64')}) format("woff2")}`;
const fonts = [
  font('Young Serif', 'youngserif-latin.woff2', 400),
  font('Figtree', 'figtree-latin.woff2', '400 700'),
  font('JetBrains Mono', 'jetbrainsmono-500-latin.woff2', 500),
].join('\n');

const json = (id, obj) => `<script type="application/json" id="${id}">${JSON.stringify(obj).replace(/<\//g, '<\\/')}</script>`;
const data = [
  json('pf-data', JSON.parse(read('data/pf-data.json'))),
  json('hu-data', { tree: JSON.parse(read('data/hu-tree.json')), strat: JSON.parse(read('data/hu-strat.json')) }),
  json('flop-data', JSON.parse(read('data/flop-data.json'))),
  json('river-data', JSON.parse(read('data/river-data.json'))),
].join('\n');

const fill = tpl => tpl
  .replace('/*@FONTS*/', () => fonts)
  .replace('/*@CSS*/', () => read('src/styles.css'))
  .replace('<!--@DATA-->', () => data)
  .replace('/*@APP*/', () => app);

const page = fill(read('src/index.html'));
for (const marker of ['/*@FONTS*/', '/*@CSS*/', '<!--@DATA-->', '/*@APP*/']) if (page.includes(marker)) throw new Error('Platzhalter übrig: ' + marker);
if (/fonts\.googleapis|fonts\.gstatic/.test(page)) throw new Error('Externe Schriftquelle im Build');

fs.mkdirSync(r('dist'), { recursive: true });
fs.writeFileSync(r('dist/index.html'), page);
// claude.ai-Artifacts liefern Doctype, <head> und <body> selbst; dort nur Titel, Stil und Inhalt.
const head = page.slice(page.indexOf('<title>'), page.indexOf('</head>'));
const body = page.slice(page.indexOf('<body>') + 6, page.lastIndexOf('</body>'));
fs.writeFileSync(r('dist/artifact.html'), '<meta charset="utf-8">\n' + head + body);
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('dist/index.html', kb(Buffer.byteLength(page)), '· App', kb(Buffer.byteLength(app)), '· Schriften', kb(Buffer.byteLength(fonts)), '· Daten', kb(Buffer.byteLength(data)));
