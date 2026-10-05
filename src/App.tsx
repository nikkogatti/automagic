import SearchChip, {drag} from './components/SearchChip';
import {loadTabs,blankFilter,STORAGE_KEY} from './lib/persistence';
import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  PROPERTIES,
  DRAG_TYPE,
  uid,
  newCriterion,
  newStack,
  buildSearch,
  applyDrop,
  decodePayload,
  typesFromLine,
  type Criterion,
  type Property,
  type Stack,
  type Payload,
  type ColorFilter,
} from "./lib/query"
import {
  api,
  cardImages,
  type Card,
  type CardData,
  type SearchResults,
  type OracleTag,
} from "./lib/api"
const asset = (n: string) => `/assets/updated-search/${n}.svg`
function Label({ children }: { children: ReactNode }) {
  return (
    <h3 className="section-label">
      <img src={asset("imgFork3")} alt="" />
      {children}
    </h3>
  )
}
export default function App() {
  const [tabs, setTabs] = useState(loadTabs),
    [tabId, setTabId] = useState(""),
    [active, setActive] = useState("")
  const current = tabs.find((t) => t.id === tabId) || tabs[0],
    target = current.stacks.find((s) => s.id === active) || current.stacks[0]
  const [results, setResults] = useState<Record<string, SearchResults>>({}),
    [submitted, setSubmitted] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const [selected, setSelected] = useState<CardData | null>(null),
    [detailBusy, setDetailBusy] = useState(false),
    [master, setMaster] = useState<Card | null>(null),
    [project, setProject] = useState("New deck"),
    [commander, setCommander] = useState(false)
  const [tagText, setTagText] = useState(""),
    [tags, setTags] = useState<OracleTag[]>([]),
    [tagBusy, setTagBusy] = useState(false),
    [tagError, setTagError] = useState(""),
    [recent, setRecent] = useState<string[]>([])
  const request = useRef<AbortController | null>(null),
    detailRequest = useRef<AbortController | null>(null)
  let query = "",
    validation = ""
  try {
    query = buildSearch(current.stacks, current.filter, commander)
  } catch (e) {
    validation = (e as Error).message
  }
  const result = results[current.id],
    dirty = !!result && submitted[current.id] !== query
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
    } catch {}
  }, [tabs])
  function switchTab(id: string) {
    request.current?.abort()
    setBusy(false)
    setError("")
    setTabId(id)
    setActive("")
  }
  useEffect(() => {
    const c = new AbortController()
    setTags([])
    setTagError("")
    if (!tagText.trim()) {
      setTags([])
      setTagBusy(false)
      return
    }
    setTagBusy(true)
    setTagError("")
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ tags: OracleTag[] }>(
          `/api/tags?q=${encodeURIComponent(tagText)}`, c.signal,
        )
        if (!c.signal.aborted) setTags(data.tags)
      } catch (e) {
        if (!c.signal.aborted) setTagError((e as Error).message)
      } finally {
        if (!c.signal.aborted) setTagBusy(false)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      c.abort()
    }
  }, [tagText])
  useEffect(
    () => () => {
      request.current?.abort()
      detailRequest.current?.abort()
    },
    [],
  )
  function update(stacks: Stack[]) {
    setTabs((prev) =>
      prev.map((t) => (t.id === current.id ? { ...t, stacks } : t)),
    )
  }
  function drop(id: string, p: Payload, before?: string) {
    update(applyDrop(current.stacks, id, p, before))
    setActive(id)
    if (p.kind === "criterion" && p.criterion.type === "tag")
      setRecent((prev) =>
        [
          p.criterion.value,
          ...prev.filter((v) => v !== p.criterion.value),
        ].slice(0, 12),
      )
  }
  function add(item: Criterion) {
    drop(target.id, { version: 1, kind: "criterion", criterion: item })
  }
  function addStack(p?: Payload) {
    const s = newStack()
    update(
      p ? applyDrop([...current.stacks, s], s.id, p) : [...current.stacks, s],
    )
    setActive(s.id)
  }
  function filter(patch: Partial<ColorFilter>) {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === current.id ? { ...t, filter: { ...t.filter, ...patch } } : t,
      ),
    )
  }
  async function search(page = 1) {
    if (validation || !query) return
    request.current?.abort()
    const c = new AbortController()
    request.current = c
    const id = current.id,
      q = page > 1 ? submitted[id] : query
    setBusy(true)
    setError("")
    try {
      const data = await api<SearchResults>(
        `/api/search?q=${encodeURIComponent(q)}&page=${page}`,
        c.signal,
      )
      if (c.signal.aborted) return
      setResults((prev) => ({
        ...prev,
        [id]:
          page > 1
            ? { ...data, cards: [...new Map([...(prev[id]?.cards || []), ...data.cards].map(card => [card.id, card])).values()] }
            : data,
      }))
      setSubmitted((prev) => ({ ...prev, [id]: q }))
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message)
    } finally {
      if (!c.signal.aborted) setBusy(false)
    }
  }
  async function select(card: Card) {
    detailRequest.current?.abort()
    const c = new AbortController()
    detailRequest.current = c
    setSelected({ card, tags: null })
    setDetailBusy(true)
    try {
      const data = await api<CardData>(`/api/card?id=${card.id}`, c.signal)
      if (!c.signal.aborted) setSelected(data)
    } catch (e) {
      if (!c.signal.aborted)
        setSelected({ card, tags: null, tagError: (e as Error).message })
    } finally {
      if (!c.signal.aborted) setDetailBusy(false)
    }
  }
  function template(type: Property, value = "") {
    const item = newCriterion(type, value)
    return <SearchChip key={`${type}:${value}`} item={item} add={() => add(item)} />
  }
  return (
    <main
      className="builder"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault()
          void search()
        }
      }}
    >
      <header className="builder-header">
        <div>
          <Label>Project</Label>
          <input
            className="project-name"
            aria-label="Project name"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
        </div>
        <div className="master-heading">
          <Label>Master Card</Label>
          <h1>{master?.name || "auto magic"}</h1>
          <span>
            {master ? "Selected master card" : "Build your next discovery"}
          </span>
        </div>
        <div className="role">
          <Label>Role</Label>
          <button
            className={commander ? "chosen" : ""}
            onClick={() => setCommander(true)}
          >
            <img src={asset("imgCrown")} alt="" />
            Commander
          </button>
          <button
            className={!commander ? "chosen" : ""}
            onClick={() => setCommander(false)}
          >
            <img src={asset("imgFork")} alt="" />
            The 99
          </button>
        </div>
      </header>
      <div className="builder-divider">
        <img src={asset("imgFork1")} alt="" />
        <span />
        <img src={asset("imgFork2")} alt="" />
      </div>
      <div className="builder-columns">
        <aside className="bucket">
          <h2 className="panel-title">
            <img src={asset("imgUnion")} alt="" />
            Tag Bucket
          </h2>
          <div className="bucket-body">
            <Label>Oracle Tags</Label>
            <div className="tag-search">
              <input
                aria-label="Find oracle tags"
                placeholder="Find a tag…"
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
              />
              <button
                aria-label="Add oracle tag"
                disabled={!tagText.trim()}
                onClick={() => add(newCriterion("tag", tagText))}
              >
                <img src={asset("imgAdd")} alt="" />
              </button>
            </div>
            <p className="hint">
              Drag into a stack, or click to add to the selected stack.
            </p>
            {tagBusy && <p role="status">Finding tags…</p>}
            {tagError && (
              <p className="error" role="alert">
                {tagError}
              </p>
            )}
            <div className="chip-list">
              {tags.map((t) => template("tag", t.slug))}
            </div>
            <Label>Modifiers</Label>
            <div className="block-list">
              {(["all", "any", "none"] as const).map((value) => (
                <button
                  key={value}
                  draggable
                  onDragStart={(e) =>
                    drag(e, { version: 1, kind: "modifier", value })
                  }
                  onClick={() =>
                    drop(target.id, { version: 1, kind: "modifier", value })
                  }
                >
                  {value}
                </button>
              ))}
            </div>
            <Label>Stack Links</Label>
            <div className="block-list">
              {(["and", "or"] as const).map((value) => (
                <button
                  key={value}
                  draggable
                  onDragStart={(e) =>
                    drag(e, { version: 1, kind: "link", value })
                  }
                  onClick={() =>
                    drop(target.id, { version: 1, kind: "link", value })
                  }
                >
                  {value}
                </button>
              ))}
            </div>
            <Label>Block Types</Label>
            <div className="chip-list">
              {(Object.keys(PROPERTIES) as Property[])
                .slice(0, 8)
                .map((t) => template(t))}
            </div>
            <select
              className="other-property"
              aria-label="Add another property"
              value=""
              onChange={(e) => {
                if (e.target.value)
                  add(newCriterion(e.target.value as Property))
              }}
            >
              <option value="">More properties…</option>
              {(Object.keys(PROPERTIES) as Property[]).slice(8).map((t) => (
                <option key={t} value={t}>
                  {PROPERTIES[t].label} ({PROPERTIES[t].prefix})
                </option>
              ))}
            </select>
            <details className="advanced-blocks">
              <summary>Drag more properties</summary>
              <div className="chip-list">
                {(Object.keys(PROPERTIES) as Property[])
                  .slice(8)
                  .map((t) => template(t))}
              </div>
            </details>
            <Label>Recent Tags</Label>
            <div className="chip-list">
              {recent.map((v) => template("tag", v))}
            </div>
          </div>
        </aside>
        <section className="center">
          <nav className="search-tabs" aria-label="Search tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={current.id === t.id ? "selected" : ""}
                onClick={() => {
                  switchTab(t.id)
                }}
              >
                {t.name}
              </button>
            ))}
            <button
              aria-label="New search tab"
              disabled={tabs.length >= 12}
              onClick={() => {
                const t = {
                  id: uid(),
                  name: `Search ${tabs.length + 1}`,
                  stacks: [newStack()],
                  filter: blankFilter(),
                }
                setTabs([...tabs, t])
                switchTab(t.id)
              }}
            >
              <img src={asset("imgUnion1")} alt="" />
            </button>
          </nav>
          <section className="search-editor" aria-label="Search stacks">
            <div className="stack-list">
              {current.stacks.map((s, index) => (
                <div
                  key={s.id}
                  className={`stack ${s.modifier} ${
                    target.id === s.id ? "active" : ""
                  }`}
                  aria-label={`Stack ${index + 1}`}
                  onClick={() => setActive(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const p = decodePayload(e.dataTransfer.getData(DRAG_TYPE))
                    if (p) {
                      e.preventDefault()
                      drop(s.id, p)
                    }
                  }}
                >
                  <div className="stack-branch">
                    <img src={asset(index ? "imgArm1" : "imgArm")} alt="" />
                  </div>
                  <div className="stack-content">
                    {index > 0 && (
                      <select
                        className="link"
                        aria-label={`Stack ${index + 1} link`}
                        value={s.link}
                        onChange={(e) =>
                          update(
                            current.stacks.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    link: e.target.value as Stack["link"],
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="and">AND</option>
                        <option value="or">OR</option>
                      </select>
                    )}
                    <div className="stack-row">
                      <select
                        className="modifier"
                        aria-label={`Stack ${index + 1} modifier`}
                        value={s.modifier}
                        onChange={(e) =>
                          update(
                            current.stacks.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    modifier: e.target
                                      .value as Stack["modifier"],
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {["all", "any", "none"].map((m) => (
                          <option key={m} value={m}>
                            {m.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      <div className="stack-chips">
                        {s.items.map((item) => (
                          <SearchChip
                            key={item.id}
                            item={item}
                            source={{ stackId: s.id, chipId: item.id }}
                            drop={(p) => drop(s.id, p, item.id)}
                            change={(changed) =>
                              update(
                                current.stacks.map((x) =>
                                  x.id === s.id
                                    ? {
                                        ...x,
                                        items: x.items.map((c) =>
                                          c.id === item.id ? changed : c,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            remove={() =>
                              update(
                                current.stacks.map((x) =>
                                  x.id === s.id
                                    ? {
                                        ...x,
                                        items: x.items.filter(
                                          (c) => c.id !== item.id,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        ))}
                        {!s.items.length && (
                          <span className="drop-hint">
                            Drop search chips here
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className="delete-stack"
                    disabled={current.stacks.length === 1}
                    aria-label={`Delete stack ${index + 1}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      update(current.stacks.filter((x) => x.id !== s.id))
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="new-stack"
                onClick={() => addStack()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const p = decodePayload(e.dataTransfer.getData(DRAG_TYPE))
                  if (p) {
                    e.preventDefault()
                    addStack(p)
                  }
                }}
              >
                + New Stack
              </button>
            </div>
            <div className="color-bar">
              {"WUBRG".split("").map((c) => (
                <button
                  key={c}
                  className={`mana-color ${
                    current.filter.colors.includes(c) ? "on" : ""
                  }`}
                  aria-label={`Filter ${c}`}
                  aria-pressed={current.filter.colors.includes(c)}
                  onClick={() =>
                    filter({
                      colors: current.filter.colors.includes(c)
                        ? current.filter.colors.filter((x) => x !== c)
                        : [...current.filter.colors, c],
                    })
                  }
                >
                  {c}
                </button>
              ))}
              <select
                aria-label="Color filter property"
                value={current.filter.identity ? "id" : "c"}
                onChange={(e) => filter({ identity: e.target.value === "id" })}
              >
                <option value="id">Identity</option>
                <option value="c">Color</option>
              </select>
              <select
                aria-label="Color filter comparison"
                value={current.filter.mode}
                onChange={(e) =>
                  filter({ mode: e.target.value as ColorFilter["mode"] })
                }
              >
                <option value="at_most">At most</option>
                <option value="at_least">At least</option>
                <option value="exactly">Exactly</option>
              </select>
            </div>
            <div className="query-footer">
              <code aria-label="Scryfall query">
                {validation || query || "Add a search chip to begin."}
              </code>
              <button
                className="run-search"
                disabled={busy || !!validation || !query}
                onClick={() => void search()}
              >
                {busy ? "Searching…" : "Search"}
              </button>
            </div>
          </section>
          <section className="results-panel" aria-label="Search results">
            <div className="result-corners" aria-hidden="true">
              {[
                "imgTopleft",
                "imgTopright",
                "imgBottomLeft",
                "imgBottomright",
              ].map((n) => (
                <img key={n} className={n} src={asset(n)} alt="" />
              ))}
            </div>
            <div className="results-heading">
              <Label>Results</Label>
              <span role="status">
                {busy
                  ? "Searching…"
                  : result
                    ? `${result.total.toLocaleString()} cards`
                    : "Run your search"}
              </span>
            </div>
            {dirty && (
              <p className="hint">
                Search changed. Run Search to update these results.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {result?.warnings?.map((w) => (
              <p className="hint" key={w}>
                {w}
              </p>
            ))}
            <div className="result-grid">
              {result?.cards.map((card) => (
                <button
                  className={`result-card ${
                    selected?.card.id === card.id ? "selected" : ""
                  }`}
                  key={card.id}
                  aria-label={`View ${card.name}`}
                  onClick={() => void select(card)}
                >
                  <img
                    src={cardImages(card)[0]}
                    alt={card.name}
                    loading="lazy"
                  />
                  <span>{card.name}</span>
                </button>
              ))}
            </div>
            {result && !result.cards.length && (
              <p>No cards match this search.</p>
            )}
            {result?.hasMore && (
              <button
                className="load-more"
                disabled={busy || dirty}
                onClick={() => void search(result.page + 1)}
              >
                Load more cards
              </button>
            )}
          </section>
        </section>
        <aside className="inspector">
          <h2 className="panel-title">
            Details
            <img src={asset("imgUnion2")} alt="" />
          </h2>
          {selected ? (
            <>
              <div className="detail-images">
                {cardImages(selected.card).map((url, i) => (
                  <img
                    src={url}
                    key={url}
                    alt={`${selected.card.name}${i ? " — back face" : ""}`}
                  />
                ))}
              </div>
              <div className="detail-body">
                <Label>Card Contents</Label>
                <h2>{selected.card.name}</h2>
                <button
                  className="master-button"
                  onClick={() => setMaster(selected.card)}
                >
                  Set as master card
                </button>
                <div className="chip-list">
                  {template("cmc", String(selected.card.cmc))}
                </div>
                {(selected.card.card_faces?.length
                  ? selected.card.card_faces
                  : [selected.card]
                ).map((face, i) => (
                  <div key={i} className="card-face">
                    {selected.card.card_faces && <h3>{face.name}</h3>}
                    <div className="chip-list">
                      {face.mana_cost && template("mana", face.mana_cost)}
                      {typesFromLine(face.type_line || "").map((t) =>
                        template(t.type, t.value),
                      )}
                    </div>
                    <p className="oracle-text">{face.oracle_text}</p>
                    <div className="chip-list">
                      {face.power !== undefined &&
                        template("power", face.power)}
                      {face.toughness !== undefined &&
                        template("toughness", face.toughness)}
                      {face.loyalty !== undefined &&
                        template("loyalty", face.loyalty)}
                    </div>
                  </div>
                ))}
                <Label>Oracle Tags</Label>
                {detailBusy && <p role="status">Loading card tags…</p>}
                {selected.tagError && (
                  <p className="error" role="alert">
                    {selected.tagError}
                  </p>
                )}
                <div className="chip-list">
                  {selected.tags
                    ?.filter((t) => t.type === "ORACLE_CARD_TAG")
                    .map((t) => template("tag", t.slug))}
                </div>
                {selected.tags &&
                  !selected.tags.some((t) => t.type === "ORACLE_CARD_TAG") && (
                    <p className="hint">No oracle tags on this card.</p>
                  )}
                <a
                  href={selected.card.scryfall_uri}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Scryfall ↗
                </a>
              </div>
            </>
          ) : (
            <p className="detail-empty">
              Select a result to inspect its card and drag properties into your
              search.
            </p>
          )}
        </aside>
      </div>
      <p className="app-footnote">
        All matches every chip · Any matches at least one · None excludes every
        chip. Stack links combine from top to bottom. Ctrl + Enter searches.
      </p>
    </main>
  )
}
