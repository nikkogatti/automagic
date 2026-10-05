import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

mkdirSync(new URL("../data/", import.meta.url), { recursive: true })
const db = new DatabaseSync(
  fileURLToPath(new URL("../data/scryfall.sqlite", import.meta.url)),
)
db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS card_tags (card_id TEXT NOT NULL, type TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(card_id,type,slug));
 CREATE INDEX IF NOT EXISTS card_tags_lookup ON card_tags(type,slug);`)
const client = new Client({ name: "automagic", version: "0.1.0" })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    fileURLToPath(
      new URL(
        "../vendor/scryfall-connector-main/dist/index.js",
        import.meta.url,
      ),
    ),
  ],
  stderr: "inherit",
})
await client.connect(transport)
export async function close() {
  await client.close()
  db.close()
}
async function tool(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, {
    timeout: 30000,
  })
  if (result.isError)
    throw new Error(
      result.content?.find((c) => c.type === "text")?.text ||
        "Connector failed",
    )
  return (
    result.structuredContent ??
    JSON.parse(result.content.find((c) => c.type === "text").text)
  )
}
const pending = new Map()
async function cached(key, load) {
  const row = db
    .prepare("SELECT value FROM cache WHERE key=? AND expires>?")
    .get(key, Date.now())
  if (row) return JSON.parse(row.value)
  if (pending.has(key)) return pending.get(key)
  const promise = load()
    .then((value) => {
      db.prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)").run(
        key,
        JSON.stringify(value),
        Date.now() + 3600000,
      )
      return value
    })
    .finally(() => pending.delete(key))
  pending.set(key, promise)
  return promise
}
let taggerQueue = Promise.resolve()
async function graphql(query, variables) {
  // Serialize session requests and rate-limit this unofficial Tagger endpoint.
  const request = taggerQueue.then(async () => {
    const headers = {
      "User-Agent": "auto-magic/0.1 (local MTG deck search)",
      Accept: "application/json",
    }
    const page = await fetch("https://tagger.scryfall.com/card/lea/1", {
      headers: { ...headers, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    })
    if (!page.ok) throw new Error(`Tagger session failed (${page.status})`)
    const html = await page.text()
    const token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1]
    if (!token) throw new Error("Tagger session format changed")
    const cookie = page.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ")
    const response = await fetch("https://tagger.scryfall.com/graphql", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
        Cookie: cookie,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`Tagger unavailable (${response.status})`)
    const body = await response.json()
    if (body.errors?.length)
      throw new Error(`Tagger: ${body.errors[0].message}`)
    if (!body.data) throw new Error("Tagger returned no data")
    return body.data
  })
  taggerQueue = request
    .catch(() => {})
    .then(() => new Promise((resolve) => setTimeout(resolve, 150)))
  return request
}
async function tagsFor(card) {
  return cached(`tags:${card.id}`, async () => {
    const tags = new Map()
    const backs = card.card_faces?.some((face) => face.image_uris)
      ? [false, true]
      : [false]
    for (const back of backs) {
      const data = await graphql(
        `query FetchCard($set:String!,$number:String!,$back:Boolean!) {
    card:cardBySet(set:$set,number:$number,back:$back) {
     taggings { tag { name slug type ancestorTags { name slug type } } }
    }
   }`,
        { set: card.set, number: card.collector_number, back },
      )
      if (!data.card || !Array.isArray(data.card.taggings))
        throw new Error("Card is unavailable in Tagger")
      for (const tagging of data.card.taggings)
        for (const tag of [tagging.tag, ...(tagging.tag.ancestorTags ?? [])]) {
          tags.set(`${tag.type}:${tag.slug}`, {
            name: tag.name,
            slug: tag.slug,
            type: tag.type,
          })
        }
    }
    const values = [...tags.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    db.exec("BEGIN")
    try {
      db.prepare("DELETE FROM card_tags WHERE card_id=?").run(card.id)
      const insert = db.prepare("INSERT INTO card_tags VALUES(?,?,?,?)")
      for (const tag of values)
        insert.run(card.id, tag.type, tag.slug, tag.name)
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
    return values
  })
}
export async function searchQuery(query, page = 1) {
  if (
    typeof query !== "string" ||
    !query.trim() ||
    query.length > 4000 ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000
  ) {
    throw Object.assign(new Error("Enter search criteria and a valid page."), {
      status: 400,
    })
  }
  return cached(`query:${query.trim()}:${page}`, async () => {
    let data
    try {
      data = await tool("search_cards", {
        q: query.trim(),
        page,
        unique: "cards",
        order: "name",
      })
    } catch (error) {
      if (/404.*not_found/s.test(error.message))
        return { cards: [], total: 0, hasMore: false, page, warnings: [] }
      const match = error.message.match(
        /Scryfall request failed: (\d+).*? - (.*)/s,
      )
      if (match) {
        let details = error.message
        try {
          details = JSON.parse(match[2]).details
        } catch {}
        throw Object.assign(new Error(details), {
          status: match[1] === "400" ? 400 : 502,
        })
      }
      throw error
    }
    for (const card of data.data)
      db.prepare("INSERT OR REPLACE INTO cards VALUES(?,?)").run(
        card.id,
        JSON.stringify(card),
      )
    return {
      cards: data.data,
      total: data.total_cards,
      hasMore: data.has_more,
      page,
      warnings: data.warnings ?? [],
    }
  })
}
export async function cardDetail(id) {
  if (
    typeof id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  ) {
    throw Object.assign(new Error("Invalid card ID."), { status: 400 })
  }
  const row = db.prepare("SELECT json FROM cards WHERE id=?").get(id)
  const card = row ? JSON.parse(row.json) : await tool("get_card", { id })
  db.prepare("INSERT OR REPLACE INTO cards VALUES(?,?)").run(
    card.id,
    JSON.stringify(card),
  )
  try {
    return { card, tags: await tagsFor(card) }
  } catch (error) {
    return { card, tags: null, tagError: error.message }
  }
}
export async function oracleTags(query) {
  if (typeof query !== "string" || query.length > 100)
    throw Object.assign(new Error("Invalid tag search."), { status: 400 })
  const catalog = await cached("oracle-tag-catalog", async () => {
    const data = await tool("list_tagger_tags", {})
    if (!Array.isArray(data.function) || !data.function.length)
      throw new Error(
        "Oracle tag catalog is unavailable. You can still enter a tag name.",
      )
    return data.function.map((name) => ({
      name,
      slug: name.trim().toLowerCase().replace(/\s+/g, "-"),
      type: "ORACLE_CARD_TAG",
    }))
  })
  const term = query.trim().toLowerCase().replace(/\s+/g, "-")
  return catalog.filter((tag) => tag.slug.includes(term)).slice(0, 30)
}
