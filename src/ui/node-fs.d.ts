declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
  export function readdirSync(path: string): string[]
}
