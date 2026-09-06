import { register } from 'node:module';

/** Entry point for `node --import`. Registers the project's resolution rules for a plain Node run. */
register('./ts-resolve.mjs', import.meta.url);
