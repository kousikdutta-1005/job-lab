/** Resolve "./foo" and "@/lib/foo" to the .ts file on disk, as Vite would. */

import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, resolve as resolvePath } from "node:path"

const root = resolvePath(fileURLToPath(import.meta.url), "..", "..", "src")

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier

  if (spec.startsWith("@/")) {
    const target = resolvePath(root, spec.slice(2))
    for (const candidate of [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
  }

  if (spec.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const base = dirname(fileURLToPath(context.parentURL))
    const target = resolvePath(base, spec)
    for (const candidate of [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
  }

  return nextResolve(spec, context)
}
