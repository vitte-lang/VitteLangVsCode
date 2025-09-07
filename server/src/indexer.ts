import fs from "fs"
import path from "path"
import crypto from "crypto"

export class Indexer {
  constructor(root, opts = {}) {
    this.root = root
    this.extensions = opts.extensions || [".vitte", ".vit", ".vitl"]
    this.cacheFile = opts.cacheFile || path.join(root, ".vitte_index.json")
    this.index = new Map()
    this.mtimes = new Map()
    this.hashes = new Map()
    this.loadCache()
  }

  loadCache() {
    if (fs.existsSync(this.cacheFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"))
        for (const [k, v] of Object.entries(data.index || {})) this.index.set(k, v)
        for (const [k, v] of Object.entries(data.mtimes || {})) this.mtimes.set(k, v)
        for (const [k, v] of Object.entries(data.hashes || {})) this.hashes.set(k, v)
      } catch {}
    }
  }

  saveCache() {
    const data = {
      index: Object.fromEntries(this.index),
      mtimes: Object.fromEntries(this.mtimes),
      hashes: Object.fromEntries(this.hashes)
    }
    fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2), "utf8")
  }

  shouldIndex(file) {
    return this.extensions.includes(path.extname(file))
  }

  hashContent(content) {
    return crypto.createHash("sha256").update(content).digest("hex")
  }

  scanDir(dir) {
    const res = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) res.push(...this.scanDir(p))
      else if (this.shouldIndex(p)) res.push(p)
    }
    return res
  }

  tokenize(content) {
    return content.split(/\W+/).filter(Boolean)
  }

  updateFile(file) {
    try {
      const stat = fs.statSync(file)
      const mtime = stat.mtimeMs
      const oldMtime = this.mtimes.get(file)
      if (oldMtime && oldMtime >= mtime) return false
      const content = fs.readFileSync(file, "utf8")
      const hash = this.hashContent(content)
      if (this.hashes.get(file) === hash) return false
      const tokens = this.tokenize(content)
      this.index.set(file, tokens)
      this.mtimes.set(file, mtime)
      this.hashes.set(file, hash)
      return true
    } catch {
      return false
    }
  }

  buildIndex() {
    const files = this.scanDir(this.root)
    let changed = false
    for (const f of files) if (this.updateFile(f)) changed = true
    if (changed) this.saveCache()
  }

  search(term) {
    const results = []
    for (const [file, tokens] of this.index.entries()) {
      if (tokens.includes(term)) results.push(file)
    }
    return results
  }

  listFiles() {
    return Array.from(this.index.keys())
  }

  stats() {
    let files = this.index.size
    let tokens = 0
    for (const t of this.index.values()) tokens += t.length
    return { files, tokens }
  }

  clear() {
    this.index.clear()
    this.mtimes.clear()
    this.hashes.clear()
    if (fs.existsSync(this.cacheFile)) fs.unlinkSync(this.cacheFile)
  }
}

export function createIndexer(root, opts) {
  const idx = new Indexer(root, opts)
  idx.buildIndex()
  return idx
}
