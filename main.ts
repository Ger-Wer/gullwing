// Gullwing — harness entry point (Node 22, standard library only).
// The game lives in game/ as plain static files (game/index.html and its ES
// modules, no library, no network request); this program hands it in. It
// copies game/ and screenshots/ from beside this file into /output and writes
// /output/dossier.json, the summary the judge reads, with the kit's
// makefun-game.ts library.
//
// /output is a mounted volume on the grader: never remove the directory
// itself. This program only writes fresh files into game/ and screenshots/
// subdirectories it creates, so nothing is deleted at all.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
const outGame = join(out, 'game');
const outShots = join(out, 'screenshots');
mkdirSync(outGame, { recursive: true });
mkdirSync(outShots, { recursive: true });
cpSync(join(here, 'game'), outGame, { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), outShots, { recursive: true });

// The scorer's own caps (reference/gate.json): text_max_bytes shapes the
// dossier text; the rest only refuse an entry the scorer would refuse (more
// than 4 screenshots or one over 256 KiB; more than 993 files or 48 MiB in
// game/, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
