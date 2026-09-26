// Node module hooks so plain `node` (native type stripping) can load the app's engine sources, which use
// bundler-style extensionless relative imports ('../contracts'). Resolution only: '<spec>' → '<spec>.ts'
// or '<spec>/index.ts'. Loaded with `node --import ./tools/product-sim/resolve-hooks.ts …`.
import { registerHooks } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile()
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
      if (!isFile(base)) {
        for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
          if (isFile(candidate)) return nextResolve(pathToFileURL(candidate).href, context)
        }
      }
    }
    return nextResolve(specifier, context)
  },
})
