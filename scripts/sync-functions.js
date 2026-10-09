// Kopiert die Kernlogik und die Solver-Daten, die der Server braucht, nach supabase/functions/_shared.
// Edge Functions werden ohne den Rest des Repositorys gebündelt; so rechnen Server und Website identisch.
// Aufruf: npm run functions:sync   (mit --check nur prüfen, ob die Kopie aktuell ist)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES = {
  'src/core/online.js': 'core/online.js', 'src/core/cards.js': 'core/cards.js', 'src/core/evaluator.js': 'core/evaluator.js',
  'src/core/equity.js': 'core/equity.js', 'src/core/rating.js': 'core/rating.js', 'src/core/pushfold.js': 'core/pushfold.js',
  'src/core/hutree.js': 'core/hutree.js', 'src/core/preflop.js': 'core/preflop.js',
  'public/data/pf-data.json': 'data/pf-data.json', 'public/data/hu-tree.json': 'data/hu-tree.json', 'public/data/hu-strat.json': 'data/hu-strat.json',
};
const root = new URL('../', import.meta.url), dest = new URL('supabase/functions/_shared/', root);

/** Inhalt, den die Kopie haben muss. */
export function expected(src) {
  const text = fs.readFileSync(new URL(src, root), 'utf8');
  return src.endsWith('.js') ? `// Automatisch kopiert aus ${src} (npm run functions:sync). Nicht hier ändern.\n` + text : text;
}
/** Dateien, deren Kopie fehlt oder veraltet ist. */
export function stale() {
  return Object.entries(FILES).filter(([src, to]) => {
    const f = new URL(to, dest);
    return !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== expected(src);
  }).map(([src]) => src);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const s = stale();
    if (s.length) { console.error('Veraltet: ' + s.join(', ') + '\nnpm run functions:sync ausführen.'); process.exit(1); }
    console.log('Kopie für die Edge Function ist aktuell.');
  } else {
    for (const [src, to] of Object.entries(FILES)) {
      const f = new URL(to, dest);
      fs.mkdirSync(new URL('./', f), { recursive: true });
      fs.writeFileSync(f, expected(src));
    }
    console.log(`${Object.keys(FILES).length} Dateien nach supabase/functions/_shared kopiert.`);
  }
}
