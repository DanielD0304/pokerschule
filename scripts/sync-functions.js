// Kopiert die Kernlogik und die Solver-Daten, die der Server braucht, nach supabase/functions/_shared.
// Edge Functions (online, challenge) werden ohne den Rest des Repositorys gebündelt; so rechnen Server und Website identisch.
// Aufruf: npm run functions:sync   (mit --check nur prüfen, ob die Kopie aktuell ist)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES = {
  'src/core/online.js': 'core/online.js', 'src/core/cards.js': 'core/cards.js', 'src/core/evaluator.js': 'core/evaluator.js',
  'src/core/equity.js': 'core/equity.js', 'src/core/rating.js': 'core/rating.js', 'src/core/pushfold.js': 'core/pushfold.js',
  'src/core/hutree.js': 'core/hutree.js', 'src/core/preflop.js': 'core/preflop.js',
  'src/core/spots.js': 'core/spots.js', 'src/core/community.js': 'core/community.js', 'src/core/flops.js': 'core/flops.js',
  'public/data/pf-data.json': 'data/pf-data.json', 'public/data/hu-tree.json': 'data/hu-tree.json', 'public/data/hu-strat.json': 'data/hu-strat.json',
  'public/data/river-data.json': 'data/river-data.json',
};
const root = new URL('../', import.meta.url), dest = new URL('supabase/functions/_shared/', root);
const FLOP_SRC = 'public/data/flop/', FLOP_DEST = 'data/flop/';
/** Erzeugtes Modul: alle Flop-Boards als statische Importe (Edge Functions bündeln nur, was statisch importiert wird). */
export const FLOP_MODULE = FLOP_DEST + 'all.js';

/** Alle Ziele mit ihrem Soll-Inhalt: { to, src, content() }. */
function targets() {
  const list = Object.entries(FILES).map(([src, to]) => ({ to, src, content: () => expected(src) }));
  const index = JSON.parse(fs.readFileSync(new URL(FLOP_SRC + 'index.json', root), 'utf8'));
  for (const f of ['index.json', ...index.boards.map(b => b.board + '.json')]) list.push({ to: FLOP_DEST + f, src: FLOP_SRC + f, content: () => expected(FLOP_SRC + f) });
  list.push({ to: FLOP_MODULE, src: FLOP_SRC + 'index.json', content: () => flopModule(index) });
  return list;
}
function flopModule(index) {
  const names = index.boards.map((b, i) => `b${i}`);
  return `// Automatisch erzeugt aus ${FLOP_SRC} (npm run functions:sync). Nicht hier ändern.\n`
    + `import index from './index.json' with { type: 'json' };\n`
    + index.boards.map((b, i) => `import ${names[i]} from './${b.board}.json' with { type: 'json' };\n`).join('')
    + `/** Flop-Daten wie in der Website: Baum und alle Boards mit Gewicht w und Typen. */\n`
    + `export default { tree: index.tree, boards: [${names.join(', ')}].map((b, i) => ({ ...b, w: index.boards[i].w, tags: index.boards[i].tags })) };\n`;
}

/** Inhalt, den die Kopie einer Datei haben muss. */
export function expected(src) {
  const text = fs.readFileSync(new URL(src, root), 'utf8');
  return src.endsWith('.js') ? `// Automatisch kopiert aus ${src} (npm run functions:sync). Nicht hier ändern.\n` + text : text;
}
/** Quellen, deren Kopie fehlt oder veraltet ist, und Dateien in data/flop, die es nicht mehr geben soll. */
export function stale() {
  const list = targets(), out = list.filter(t => {
    const f = new URL(t.to, dest);
    return !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== t.content();
  }).map(t => t.to === FLOP_MODULE ? FLOP_MODULE : t.src);
  const dir = new URL(FLOP_DEST, dest), keep = new Set(list.map(t => t.to));
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!keep.has(FLOP_DEST + f)) out.push('überzählig: ' + FLOP_DEST + f);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const s = stale();
    if (s.length) { console.error('Veraltet: ' + s.join(', ') + '\nnpm run functions:sync ausführen.'); process.exit(1); }
    console.log('Kopie für die Edge Functions ist aktuell.');
  } else {
    const list = targets();
    // alte Board-Dateien entfernen (z. B. nach einer neuen Auswahl)
    const dir = new URL(FLOP_DEST, dest), keep = new Set(list.map(t => t.to));
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!keep.has(FLOP_DEST + f)) fs.rmSync(new URL(f, dir));
    for (const t of list) {
      const f = new URL(t.to, dest);
      fs.mkdirSync(new URL('./', f), { recursive: true });
      fs.writeFileSync(f, t.content());
    }
    console.log(`${list.length} Dateien nach supabase/functions/_shared geschrieben.`);
  }
}
