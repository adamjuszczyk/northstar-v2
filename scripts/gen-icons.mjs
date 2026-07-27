#!/usr/bin/env node
/**
 * Generates public/icons/icon-192.png and icon-512.png
 * 4-pointed star (✦) on #080A11 background, gold #F6C87A
 * No external deps — pure Node.js zlib + Buffer.
 */
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'

// ── CRC32 ───────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ── PNG builder ─────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t   = Buffer.from(type)
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function makePNG(w, h, pixelFn) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB

  const raw = Buffer.allocUnsafe(h * (1 + w * 3))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0 // filter = None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelFn(x, y, w, h)
      const off = y * (1 + w * 3) + 1 + x * 3
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Star pixel ──────────────────────────────────────────────────────────────
const BG = [8, 10, 17]      // #080A11
const FG = [246, 200, 122]  // #F6C87A

function starPixel(px, py, w, h) {
  const cx  = (px - w / 2 + 0.5) / (w * 0.44)
  const cy  = (py - h / 2 + 0.5) / (h * 0.44)
  const r   = Math.sqrt(cx * cx + cy * cy)
  const th  = Math.atan2(cy, cx)

  // 4-pointed star radius at angle theta
  const starR = 0.18 + 0.82 * Math.pow(Math.abs(Math.cos(2 * th)), 1.6)
  const d     = r - starR

  // Anti-alias over 1 screen pixel
  const aa = 1 / (w * 0.44)
  const t  = Math.max(0, Math.min(1, 1 - d / aa))

  // Clamp to [0,255]
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)))
  return [
    clamp(BG[0] + t * (FG[0] - BG[0])),
    clamp(BG[1] + t * (FG[1] - BG[1])),
    clamp(BG[2] + t * (FG[2] - BG[2])),
  ]
}

// ── Generate ────────────────────────────────────────────────────────────────
mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', makePNG(192, 192, starPixel))
writeFileSync('public/icons/icon-512.png', makePNG(512, 512, starPixel))
console.log('✦  Icons generated: public/icons/icon-192.png  icon-512.png')
