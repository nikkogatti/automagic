# auto magic — visual Magic: The Gathering search

This is a working local search builder, not a complete deck editor. Users drag typed chips into stacks, choose All/Any/None and And/Or links, execute a Scryfall query, and inspect a selected card. The original random-card testing screen has been replaced. Do not restore its behavior or infer card tags from keywords.

## Start on a new device

Extract the ZIP, open the `automagic` folder in your editor, and install **Node.js 24+** and **pnpm 11.25.0**. Node 24 supplies SQLite and TypeScript stripping for the tests. Internet access is required for dependency installation and uncached Scryfall/Tagger requests. No API key or Figma login is needed to run the app; all design assets and fonts are local.

Run these commands from the project root:

```sh
pnpm install --frozen-lockfile
pnpm --dir vendor/scryfall-connector-main install --frozen-lockfile
pnpm build:connector
pnpm check
pnpm start
```

Open **http://localhost:8787**. The app recreates `data/scryfall.sqlite` automatically. The ZIP deliberately excludes dependencies, build output, live database files, browser state, and the unrelated archive. These are regenerated or device-local.

For development, keep `pnpm start` running for the API, then run `pnpm dev` in another terminal and open **http://localhost:5173**. Vite proxies `/api` to port 8787. Frontend changes hot reload there; server changes require restarting `pnpm start`. The production port serves `dist` and needs a rebuild after frontend edits. `pnpm preview` is only Vite's static preview and does not provide the API.

Windows users can run `./Start-App.ps1` after installing both sets of dependencies; it builds the connector if missing, rebuilds the frontend, and starts the app. It requires Node on PATH. `.mise.toml` is an optional matching toolchain configuration, not a requirement to install mise.

`API_PORT` overrides the production/API port. The development proxy currently assumes 8787, so update `vite.config.ts` too if changing it. The server binds to 127.0.0.1; a second device runs its own copy rather than connecting to this localhost address. Keep Git working copies outside OneDrive, pull before editing, then commit/push to transfer code changes.

## Read this first when continuing with an LLM

1. Read `AGENTS.md`, this document, and `package.json`.
2. Start with the file relevant to the requested behavior in the map below. Keep changes small; do not add a UI framework or remote database just to edit this local prototype.
3. Preserve query grouping, the common chip model, and the distinction between unavailable tags and an empty tag list. Add regression tests for changes to these rules.
4. Run `pnpm check` and `pnpm build:connector` if connector source changes. For backend changes, restart the server before live checks. Do not use an old running process as proof that changed server code works.
5. Check actual drag/drop and the UI at desktop and narrow widths when altering interaction/layout. Click-to-add is the keyboard/touch alternative. Keep local asset references and licenses intact.
6. Report what changed, what was verified, and any remaining limitations. Never claim full offline functionality or cross-device browser-state synchronization.

## Code map

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | Mount React; import both plain CSS files. |
| `src/App.tsx` | Three-panel layout, tab state, active stack, query execution, results/pagination, tag catalog, selected-card details. |
| `src/components/SearchChip.tsx` | Shared draggable chip, editable values/comparisons, removal and insertion target; exports the drag encoder. |
| `src/lib/query.ts` | Property registry, typed model, constructors, query compiler, drag decoder/reducer, transcription type mapping. |
| `src/lib/persistence.ts` | Storage key, tab schema, strict whole-snapshot validation and initial-state fallback. |
| `src/lib/api.ts` | Card/face/tag/result types, fetch wrapper, image selection. |
| `src/index.css` | Local fonts, global reset and base colors. |
| `src/builder.css` | Layout, chips, panels and responsive breakpoints (1200/760px). |
| `server/index.mjs` | Local HTTP routes, static `dist` serving, errors and process shutdown. |
| `server/service.mjs` | MCP connection, card/search cache, SQLite records, serialized Tagger GraphQL requests. |
| `query.test.mjs` | Offline Node regression tests for compiler, drop behavior and persisted state. |
| `vendor/scryfall-connector-main` | Upstream MIT-licensed MCP connector, source and its own dependency lockfile. |
| `public/assets/updated-search`, `public/fonts` | Used SVG artwork, font files and font licenses. |

There is no Tailwind, routing library, global state library, Figma runtime or separate database service. The problematic formatter was removed; do not reintroduce its old command. Prefer readable manual formatting and always typecheck after formatting tools run. The stylesheet is hand-written; preserve selector order when consolidating overrides.

## Product behavior and invariants

- **All** joins chips with implicit Scryfall AND: `(t:"creature" cmc<=3)`.
- **Any** joins chips with OR: `(otag:removal OR otag:draw)`.
- **None** negates each chip and joins with AND: `(-t:"land" -t:"artifact")`. It excludes every listed property; it does not mean "not all."
- Nonempty stacks combine **top to bottom**, explicitly parenthesized. Stack links A OR B AND C compile as `(A OR B) AND C`, not Scryfall's default precedence. The first meaningful stack has no incoming link; empty stacks are skipped.
- Blank chip values block submission. Text is quoted with escaped quotes/backslashes; tags normalize spaces to hyphens and validate slugs; numeric comparisons use validated operators. Do not concatenate arbitrary raw query fragments into chip values.
- Global color/identity comparisons and `is:commander` apply after the whole grouped stack expression. Commander applies this filter; **The 99 simply removes it**, and does not automatically exclude commanders or enforce Commander legality.
- New chips copy with new IDs; moving existing chips keeps their IDs and removes the source. Dropping onto another chip inserts before it. The first physical stack's link cannot be changed. At least one stack stays present.
- Search is explicit (button or Ctrl/Cmd+Enter). Editing the query flags existing results as stale and disables pagination until resubmission. Appending pages deduplicates card IDs. New searches and tab switches cancel stale UI search updates. This does not cancel work already running upstream in the server.
- Most recently selected card stays visible across searches/tabs. Detail requests cancel stale UI updates. Both faces are transcribed when available; CMC comes from the whole Scryfall card. Real assigned and inherited oracle tags are draggable alongside types, creature types, mana cost and stats.
- The master card is currently a header reference only; it does not impose deck restrictions. Project name, role, master card, recent tags, results and selection are session state. Only search tabs/stacks/color filters persist in browser `localStorage` under `automagic.search.v1`.
- Saved snapshots reject missing/duplicate IDs, invalid chip properties, malformed filters and invalid structure as a whole. Invalid/unavailable storage falls back to example stacks. The UI caps search tabs at 12; there is currently no tab rename/delete control. Browser state is not part of the ZIP and does not sync through Git.

### Property mapping

`PROPERTIES` in `src/lib/query.ts` is the source of truth. Common properties: Tags → `otag`, Card Type and Creature Type → `t`, CMC → `cmc`, Power → `pow`, Toughness → `tou`, Oracle Text → `o`, Name → `name`, Mana Cost → `mana`. The expanded bucket also supports color/identity, rarity, set, format, keyword, artist, flavor text, loyalty, combined power/toughness, produced mana, USD price, watermark, game, language, and `is`/`has` properties.

Both type chip classes use `t`; their distinction is a presentation convenience. Scryfall numeric treatment of `*` is zero, so a `pow=*` chip is not a literal printed-star-only filter. Property values still need to make sense to Scryfall; the compiler validates structure rather than maintaining all upstream vocabularies. Reference: [Scryfall search syntax](https://scryfall.com/docs/syntax).

## API and data flow

Only GET requests are supported. API responses are JSON with no-store headers; errors return `{ "error": "message" }`. Unknown API routes return 404.

| Endpoint | Response |
| --- | --- |
| `/api/search?q=ENCODED_QUERY&page=1` | `{cards,total,hasMore,page,warnings}`; ordered by name, unique cards, zero results for Scryfall not-found. |
| `/api/card?id=SCRYFALL_UUID` | `{card,tags,tagError?}`; cached/raw card plus Tagger assignments. |
| `/api/tags?q=removal` | `{tags}`; up to 30 matching oracle-tag catalog entries. |

The old `/api/random` endpoint and type/slug search fallback have been removed. Compound searches must remain Scryfall searches; Tagger fallback results would silently lose compound criteria.

The Node server launches the vendored [Scryfall connector](https://mcpmarket.com/server/scryfall-connector) as a child process over MCP stdio. It uses `search_cards`, `get_card`, and `list_tagger_tags`. Source: [latte-chan/scryfall-connector](https://github.com/latte-chan/scryfall-connector), obtained October 4, 2026; retain `vendor/.../LICENSE` and the upstream source. Connector requests provide rate limiting and retry/backoff. MCP calls time out after 30 seconds.

The connector has no per-card Tagger assignment tool. The app obtains a normal HTML session/CSRF cookie, then queries Tagger's public website GraphQL endpoint. Requests are serialized with a 150ms delay; session and query requests have 15/20-second timeouts. For double-sided image cards, tags from both faces are combined with ancestor tags, deduplicated and sorted. This is an unofficial upstream endpoint and can change.

**Tags unavailable** is `tags:null` plus `tagError`; **no tags** is `tags:[]`. Keep the card visible on failures, show the error, and never fabricate tags from rules text or keywords. The UI displays oracle tags only, although fetched relationships can include other Tagger types.

SQLite uses WAL and three tables: `cards(id,json)` for raw Scryfall objects; `card_tags(card_id,type,slug,name)` for relationships; `cache(key,value,expires)` for successful responses with a one-hour TTL. Concurrent identical service requests share an in-flight promise. This is an on-demand cache, not a full card database or offline search index. Raw card rows are stored indefinitely; response TTL determines search/tag refresh. The directory is recreated automatically and is excluded from version control/exports.

## Design reference

[auto magic designs — Updated search layout, node 47:762](https://www.figma.com/design/Y8i53TpWgZlDcUgRVLynnk/auto-magic-designs?node-id=47-762) is the current reference. Dark teal surfaces, cream text, orange selected tabs, green/red modifier accents, exact local SVG decorations, UnifrakturCook headings and IBM Plex Mono text come from this design. Oracle text uses IBM Plex Mono as the available substitute for Antarctican Mono. Follow the user's clarified All/Any/None set even if a Figma example shows additional modifiers. Live Scryfall images replace mock cards. Figma access is needed only to retrieve future design updates, not for app operation.

## Verification and troubleshooting

`pnpm check` runs TypeScript, six offline tests, and the frontend production build. Tests cover grouped links/modifiers, escaped text, malformed values, global filters, copies/moves/reordering, transcription types, invalid saved snapshots and foreign drag payloads. `pnpm build:connector` checks/builds the vendored source separately.

Live smoke check: search `otag:removal t:creature cmc<=3`, select a card and wait for tags; drag a bucket chip and a card-derived chip into a stack; edit values, change modifiers/links, submit, paginate and reload to confirm saved stacks. Also check a double-faced card. Counts change as upstream data changes, so do not assert a fixed total. Offline tests passing does not prove Tagger availability.

- Port in use: stop the specific old app process or select another `API_PORT`. Do not terminate every Node process.
- Blank/missing production page: run `pnpm build`; inspect browser/API errors rather than replacing the build with mock data.
- Missing connector: install dependencies inside the vendor folder, then run `pnpm build:connector`.
- SQLite import failure: check Node version is 24+.
- Tagger session/GraphQL errors: inspect `server/service.mjs` against current upstream behavior; preserve explicit unavailable-tag handling.
- Unexpected saved UI state: use a fresh browser profile or intentionally reset the app's own storage key. Do not silently reset working user searches during development.

Audit completed October 5, 2026: removed obsolete prototype routes and the unused formatter, extracted the shared chip and persistence modules, strengthened saved-state validation, cleared stale tag suggestions/errors, deduplicated paginated results, aligned toolchain versions and startup naming, and made CSS readable. No hosting, authentication, shared browser state or deck CRUD was added.
