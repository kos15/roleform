/**
 * Renders every app icon from the one mark (F29). `pnpm icons`.
 *
 * Home screens draw an icon at ~60px; a mark that fills two thirds of its tile
 * reads as a smudge there. So each tile is sized for the surface that shows it:
 *
 *   - apple-touch-icon (180, opaque, full bleed): iOS rounds the corners itself
 *     and paints transparent pixels black, so there is no transparency and no
 *     rounding here, and the mark fills ~80% of the tile — clear of the corner iOS cuts.
 *   - maskable (192/512, full bleed): Android crops to a circle, squircle or
 *     teardrop. Everything that matters stays inside the 80% safe-zone circle
 *     (W3C manifest spec, "icon masks"), which still lets the mark fill ~70%.
 *   - any (192/512): browsers and desktop installs that show the file as-is —
 *     a rounded tile of our own, mark at ~84%.
 *
 * The status-bar badges (badge-96/192.png) are hand-drawn silhouettes and are
 * not rendered here.
 *
 * Bump ICON_VERSION (lib/seo/icons.ts) and the service-worker VERSION after
 * running this: phones cache icons under their URL.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// sharp ships with Next (image optimisation); borrowed from there rather than
// added as a dependency of our own for a script run once per redesign.
const fromNext = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
interface SharpImage {
  png(opts: { compressionLevel: number }): SharpImage;
  flatten(opts: { background: string }): SharpImage;
  toBuffer(): Promise<Buffer>;
}
const sharp = fromNext("sharp") as (input: Buffer) => SharpImage;

const GROUND = "#f8f0e3";
const INK = "#4a0d0d";

/** The mark from app/icon.svg, without its tile. Drawn in a 32-unit box. */
const MARK = `
  <rect x="10" y="2.5" width="18" height="22" rx="3" fill="#ff9dc0" transform="rotate(9 19 13.5)"/>
  <path d="M7 7H17L22 12V26A3 3 0 0 1 19 29H7A3 3 0 0 1 4 26V10A3 3 0 0 1 7 7Z" fill="#f9b130"/>
  <path d="M17 7V10.5A1.5 1.5 0 0 0 18.5 12H22Z" fill="#e8971a"/>
  <path d="M8 13.5h5M8 18h9M8 22.5h5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="23.5" cy="23.5" r="6.5" fill="${INK}" stroke="${GROUND}" stroke-width="1.8"/>
  <path d="M20.9 23.6l1.8 1.8 3.5-3.7" stroke="#f9b130" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The mark's drawn extent inside its 32-unit box (pink card to check ring). */
const BOX = { x: 3.4, y: 1.4, w: 27.6, h: 29.5 };

function tile(size: number, fill: number, { rounded = false } = {}): string {
  const scale = (size * fill) / Math.max(BOX.w, BOX.h);
  const tx = (size - BOX.w * scale) / 2 - BOX.x * scale;
  const ty = (size - BOX.h * scale) / 2 - BOX.y * scale;
  const ground = `<rect width="${size}" height="${size}" ${rounded ? `rx="${size * 0.22}"` : ""} fill="${GROUND}"/>`;
  const mark = MARK;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ground}<g transform="translate(${tx} ${ty}) scale(${scale})">${mark}</g></svg>`;
}

async function png(svg: string, out: string, opaque = false): Promise<void> {
  let img = sharp(Buffer.from(svg)).png({ compressionLevel: 9 });
  if (opaque) img = img.flatten({ background: GROUND });
  writeFileSync(out, await img.toBuffer());
  console.log(`wrote ${out}`);
}

async function main() {
  const apple = tile(180, 0.8);
  await png(apple, "public/apple-touch-icon.png", true);
  await png(apple, "public/apple-touch-icon-precomposed.png", true);
  for (const size of [192, 512]) {
    await png(tile(size, 0.84, { rounded: true }), `public/icons/icon-${size}.png`);
    await png(tile(size, 0.7), `public/icons/icon-maskable-${size}.png`, true);
  }
  await png(tile(32, 0.9, { rounded: true }), "public/icons/favicon-32.png");
}

void main();
