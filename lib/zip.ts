/**
 * lib/zip.ts — minimal, dependency-free ZIP writer (STORE method, no
 * compression). Used by the per-folder client-document bulk download
 * (2026-07-12 file-organization build).
 *
 * Why store-only: the payload is overwhelmingly PDFs and images that are
 * already compressed, so deflate would buy almost nothing while requiring a
 * dependency (jszip/archiver) we would have to add to the build. The ZIP
 * container itself (local headers + central directory + EOCD) is simple and
 * universally readable.
 *
 * Limits: classic (non-Zip64) format — fine for < 4 GB archives and
 * < 65,535 entries, both far beyond the bulk-download cap.
 */

export interface ZipEntry {
  /** Path inside the archive; forward slashes for folders. */
  name: string
  data: Uint8Array
  mtime?: Date
}

// ── CRC-32 (IEEE 802.3), table-driven ───────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

// ── DOS date/time encoding ──────────────────────────────────────────────────
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

// ── little-endian writers ───────────────────────────────────────────────────
function u16(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff])
}
function u32(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** Build a complete ZIP archive from in-memory entries. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const { time, date } = dosDateTime(entry.mtime ?? new Date())
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header — version 20, flag bit 11 (UTF-8 names), method 0.
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(time), u16(date), u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0),
      nameBytes, entry.data,
    ])
    localParts.push(local)

    // Matching central-directory record.
    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
      u16(time), u16(date), u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset),
      nameBytes,
    ]))

    offset += local.length
  }

  const centralDir = concat(centralParts)
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralDir.length), u32(offset),
    u16(0),
  ])

  return concat([...localParts, centralDir, eocd])
}
