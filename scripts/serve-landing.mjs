import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LANDING_DIR = path.resolve(__dirname, "../landing")
const PORT = Number(process.env.PORT || 4173)

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
}

const server = http.createServer((req, res) => {
  const rawPath = (req.url || "/").split("?")[0]
  const safePath = rawPath === "/" ? "/index.html" : rawPath
  const filePath = path.join(LANDING_DIR, safePath)

  if (!filePath.startsWith(LANDING_DIR)) {
    res.writeHead(403)
    res.end("Forbidden")
    return
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("Not found")
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" })
    res.end(content)
  })
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TemplaGem Landing running at http://localhost:${PORT}`)
})
