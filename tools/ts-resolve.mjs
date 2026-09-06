/**
 * Lets Node run the project's TypeScript sources unchanged.
 *
 * Metro and `tsc` both resolve `./model` and `@/domain/money` without an extension; Node's ESM
 * resolver does not. Rather than write the domain modules in a dialect only the checker likes — which
 * would mean the thing being tested is not the thing that ships — this hook teaches Node the two
 * resolutions the project already uses.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

function firstThatExists(base) {
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return pathToFileURL(base + ext).href;
  }
  if (existsSync(base)) return pathToFileURL(base).href;
  return null;
}

export async function resolve(specifier, context, next) {
  // `@/x` is the project's own alias for `src/x`, declared in tsconfig and babel.
  if (specifier.startsWith('@/')) {
    const found = firstThatExists(path.join(SRC, specifier.slice(2)));
    if (found) return { url: found, shortCircuit: true };
  }

  // A relative import with no extension: try the ones the project actually uses.
  if (specifier.startsWith('.') && !path.extname(specifier)) {
    const from = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : SRC;
    const found = firstThatExists(path.resolve(from, specifier));
    if (found) return { url: found, shortCircuit: true };
  }

  return next(specifier, context);
}
