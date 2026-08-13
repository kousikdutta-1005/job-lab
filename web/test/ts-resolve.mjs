/**
 * Node strips TypeScript types on its own now, but it will not guess the file
 * extension the way a bundler does — and the app's source imports are all
 * extensionless because Vite resolves them. This hook does the same thing, so
 * the logic tests can import the real modules rather than a copy of them that
 * quietly drifts.
 */

import { register } from "node:module"
import { pathToFileURL } from "node:url"

register("./ts-extensions.mjs", pathToFileURL("./test/"))
