#!/usr/bin/env node
/**
 * Redimensionne les logos studio pour AniListStat.
 *
 * Convention dossiers :
 *   studio-logos-source/   ← tu déposes tes fichiers sources (PNG, JPG, WebP, SVG)
 *   public/studio-logos/   ← sortie : PNG carré, + manifest.json (généré)
 *
 * Convention nommage des fichiers sources :
 *   Le nom SANS extension doit correspondre au slug du studio tel qu’affiché sur AniList,
 *   après normalisation (voir --slug ci-dessous). Exemples :
 *     MAPPA.png ou mappa.png        → public/studio-logos/mappa.png
 *     bones.webp                    → bones.png
 *     brains-base.png               → brains-base.png
 *
 * Usage :
 *   npm run studio-logos
 *   npm run studio-logos -- --slug "Brain's Base"     # affiche le slug attendu pour le fichier
 *   npm run studio-logos -- --size 320                # taille sortie (défaut 256)
 *   npm run studio-logos -- --fit cover               # recadrage agressif (défaut: contain)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "studio-logos-source");
const OUT_DIR = path.join(ROOT, "public", "studio-logos");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

const EXT_IN = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

function slugifyStudioName(name) {
  const s = String(name || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['''`´]/g, "")
    .toLowerCase()
    .trim();
  const slug = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "studio";
}

function parseArgs(argv) {
  const out = { size: 256, slugQuery: null, fit: "contain" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--slug" && argv[i + 1]) {
      out.slugQuery = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--size" && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(n) && n >= 64 && n <= 1024) out.size = n;
      i += 1;
    } else if (argv[i] === "--fit" && argv[i + 1]) {
      const f = String(argv[i + 1] || "").toLowerCase();
      if (f === "contain" || f === "cover") out.fit = f;
      i += 1;
    }
  }
  return out;
}

async function main() {
  const { size, slugQuery, fit } = parseArgs(process.argv);
  if (slugQuery != null) {
    console.log(slugifyStudioName(slugQuery));
    process.exit(0);
  }

  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("Dépendance manquante : installe sharp avec  npm install sharp --save-dev");
    process.exit(1);
  }

  if (!fs.existsSync(SOURCE_DIR)) {
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    console.log(`Dossier créé : ${path.relative(ROOT, SOURCE_DIR)}`);
    console.log("Dépose-y tes images, puis relance : npm run studio-logos");
    process.exit(0);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const entries = fs.readdirSync(SOURCE_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => EXT_IN.has(path.extname(n).toLowerCase()));

  if (files.length === 0) {
    console.log(`Aucune image dans ${path.relative(ROOT, SOURCE_DIR)} (extensions : ${[...EXT_IN].join(", ")})`);
    process.exit(0);
  }

  const slugsOut = new Set();

  for (const file of files) {
    const stem = path.basename(file, path.extname(file));
    const slug = slugifyStudioName(stem);
    const inPath = path.join(SOURCE_DIR, file);
    const outPath = path.join(OUT_DIR, `${slug}.png`);

    await sharp(inPath)
      .trim()
      .resize(size, size, {
        fit,
        position: "centre",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, effort: 10 })
      .toFile(outPath);

    slugsOut.add(slug);
    console.log(`${file} → ${path.relative(ROOT, outPath)} (${size}×${size})`);
  }

  const existing = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => path.basename(f, ".png"));

  const allSlugs = [...new Set([...existing, ...slugsOut])].sort();

  fs.writeFileSync(
    MANIFEST,
    `${JSON.stringify({ version: 1, slugs: allSlugs, outputSize: size, fit }, null, 2)}\n`,
    "utf8"
  );
  console.log(`Manifest : ${path.relative(ROOT, MANIFEST)} (${allSlugs.length} entrées)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
