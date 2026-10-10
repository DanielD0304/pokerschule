import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'public', 'data');
export const FLOP_DIR = path.join(DATA_DIR, 'flop');
/** Feste Flop-Boards: die bisherigen 12, aus denen solver/riversolve.js die River-Spots ableitet. */
export const FIXED = ['As7d2c', 'Kc8h3s', 'Qh9h4c', 'Jd9c8d', '7h6h5c', 'Tc5c2c', '8d8s3c', 'AhKdQs', '9s4d2h', 'KhKs5d', 'Ad5s4h', 'Js7s3d'];
