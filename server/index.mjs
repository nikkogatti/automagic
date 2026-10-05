import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import {
  searchQuery,
  cardDetail,
  oracleTags,
  close,
} from "./service.mjs"
const root = fileURLToPath(new URL("../dist/", import.meta.url))
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost")
    if (req.method !== "GET") {
      res.writeHead(405)
      return res.end()
    }
    if (url.pathname.startsWith("/api/")) {
      let body
      if (url.pathname === "/api/search")
        body = await searchQuery(
          url.searchParams.get("q"),
          Number(url.searchParams.get("page") || 1),
        )
      else if (url.pathname === "/api/card")
        body = await cardDetail(url.searchParams.get("id"))
      else if (url.pathname === "/api/tags")
        body = { tags: await oracleTags(url.searchParams.get("q") || "") }
      else {
        res.writeHead(404)
        return res.end()
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      return res.end(JSON.stringify(body))
    }
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1)
    if (path.includes("..") || path.includes("\\")) {
      res.writeHead(400)
      return res.end()
    }
    const bytes = await readFile(`${root}/${path}`)
    const ext = path.split(".").pop()
    res.writeHead(200, {
      "Content-Type":
        {
          html: "text/html",
          js: "text/javascript",
          css: "text/css",
          svg: "image/svg+xml",
          png: "image/png",
          ttf: "font/ttf",
          woff2: "font/woff2",
        }[ext] || "application/octet-stream",
    })
    res.end(bytes)
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : error.status || 502
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        error: error.code === "ENOENT" ? "Not found" : error.message,
      }),
    )
  }
})
const port = Number(process.env.API_PORT || 8787)
server.once('error', async error => {
  console.error(error.message)
  await close()
  process.exit(1)
})
server.listen(port, '127.0.0.1', () => console.log(`auto magic: http://localhost:${port}`))
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.close()
    await close()
    process.exit(0)
  })
