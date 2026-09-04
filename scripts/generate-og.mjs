/**
 * generate-og.mjs — builds assets/og-image.png (1200x630) for social share cards.
 *
 * Zero dependencies: renders directly into an RGB pixel buffer and encodes a PNG
 * with the built-in `zlib`. Run with `npm run og` whenever the card copy or the
 * brand palette changes. The committed PNG is what ships; this script is only the
 * reproducible source of truth for it.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "assets", "og-image.png");

const W = 1200;
const H = 630;

/* ---- palette (mirrors css/styles.css :root) --------------------------------- */
const C = {
  paper: [0xed, 0xef, 0xea],
  surface: [0xf8, 0xf9, 0xf5],
  ink: [0x17, 0x21, 0x2c],
  inkSoft: [0x4b, 0x55, 0x60],
  line: [0xcb, 0xcf, 0xc4],
  accent: [0x2e, 0x5a, 0xac],
  ok: [0x2f, 0x7a, 0x4f],
  warn: [0xb7, 0x79, 0x1f],
  critical: [0xb3, 0x31, 0x1f],
};

/* ---- 5x7 bitmap font (uppercase, digits, a little punctuation) ------------- */
const GLYPHS = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
  ",": ["00000", "00000", "00000", "00000", "00000", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "00100", "00000", "00000", "00000", "00100", "00000"],
  "·": ["00000", "00000", "00000", "00100", "00000", "00000", "00000"],
};

/* ---- raster helpers ------------------------------------------------------- */
const buf = Buffer.alloc(W * H * 3);

function fillRect(x, y, w, h, rgb) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * W + px) * 3;
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
    }
  }
}

/** Draw one glyph with its top-left at (x, y), each source pixel `scale` wide. */
function drawChar(ch, x, y, scale, rgb) {
  const rows = GLYPHS[ch] || GLYPHS[" "];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (rows[r][c] === "1") fillRect(x + c * scale, y + r * scale, scale, scale, rgb);
    }
  }
}

/** Draw a string left-to-right; returns the x cursor after the last glyph. */
function drawText(str, x, y, scale, rgb, gap = scale) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    drawChar(ch, cx, y, scale, rgb);
    cx += 5 * scale + gap;
  }
  return cx;
}

/* ---- compose the card --------------------------------------------------- */
fillRect(0, 0, W, H, C.paper);
fillRect(48, 48, W - 96, H - 96, C.line); // 2px frame
fillRect(50, 50, W - 100, H - 100, C.surface);
fillRect(50, 50, W - 100, 10, C.accent); // top accent stripe

const x0 = 96;
drawText("SUPPORT QA · CLIENT-SIDE DEMO", x0, 128, 3, C.accent, 4);
drawText("PAYROLL REPLY", x0, 188, 9, C.ink);
drawText("CHECKER", x0, 188 + 63 + 20, 9, C.ink);
drawText("A SECOND PAIR OF EYES ON AI-DRAFTED PAYROLL REPLIES.", x0, 388, 3, C.inkSoft, 3);

fillRect(x0, 438, W - 2 * x0, 2, C.line);

let tx = x0;
for (const [label, rgb] of [
  ["ESCALATION", C.critical],
  ["COMPLIANCE", C.warn],
  ["TONE", C.ok],
]) {
  fillRect(tx, 470, 18, 18, rgb);
  tx = drawText(label, tx + 30, 470, 3, C.inkSoft, 3) + 54;
}

drawText("NO MODEL CALL · NOTHING LEAVES THE BROWSER", x0, 532, 3, C.accent, 3);

/* ---- encode PNG (RGB, 8-bit, no interlace) ----------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBytes, data]);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor
// bytes 10-12 (compression, filter, interlace) stay 0

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 3);
  raw[rowStart] = 0; // filter: none
  buf.copy(raw, rowStart + 1, y * W * 3, (y + 1) * W * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${W}x${H}, ${png.length} bytes)`);
