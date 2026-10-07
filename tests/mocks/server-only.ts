// Vitest/Vite doesn't apply Next.js's "react-server" bundler export condition,
// so the real `server-only` package (which throws unconditionally outside
// that condition) can't be imported directly in tests. vitest.config.ts
// aliases "server-only" to this no-op stub so server-side modules can be
// unit-tested without pulling in the whole Next.js build pipeline.
export {};
