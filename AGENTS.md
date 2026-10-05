# auto magic

React 19, TypeScript, Vite, and plain CSS. Node 24+ is required for built-in SQLite. Read README.md for setup and search behavior.

- `src/main.tsx` mounts `src/App.tsx` and imports `src/index.css` and `src/builder.css`.
- `src/lib/query.ts` defines supported Scryfall chip properties, grouping, validation, and drag/drop updates.
- `src/lib/api.ts` defines card data and frontend API calls.
- `server/index.mjs` serves built files and localhost API routes on port 8787.
- `server/service.mjs` manages SQLite, the vendored MCP connector, and real Tagger assignments.
- `public/assets/updated-search` and `public/fonts` contain used design assets and font licenses.
- `vendor/scryfall-connector-main` is an MIT-licensed upstream dependency; retain its source and license.

Use `pnpm dev` for the Vite UI on port 5173 with API proxying to 8787. The Node API server must also run. `pnpm build` prepares `dist`; `pnpm start` runs the production app. `Start-App.ps1` provides local startup.

Verify meaningful search changes with `node --test query.test.mjs`, `pnpm exec tsc --noEmit`, and `pnpm build`. Do not infer per-card tags when upstream assignments fail.

- `src/components/SearchChip.tsx` is the shared chip renderer and drag encoder.
- `src/lib/persistence.ts` validates saved tabs; use its storage key and schema.
- Run `pnpm check` for TypeScript, tests and production build. No formatter is configured.
