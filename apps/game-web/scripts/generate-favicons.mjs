import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const root = process.cwd();
const publicDir = path.join(root, "public");
const srcSvg = path.join(publicDir, "shadow-arena-favicon.svg");

const out = {
  png16: path.join(publicDir, "favicon-16x16.png"),
  png32: path.join(publicDir, "favicon-32x32.png"),
  apple180: path.join(publicDir, "apple-touch-icon.png"),
  android192: path.join(publicDir, "android-chrome-192x192.png"),
  android512: path.join(publicDir, "android-chrome-512x512.png"),
  ico: path.join(publicDir, "favicon.ico"),
  webmanifest: path.join(publicDir, "site.webmanifest"),
};

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function makePng(svgBuffer, size, file) {
  await sharp(svgBuffer).resize(size, size).png().toFile(file);
}

async function run() {
  await fs.mkdir(publicDir, { recursive: true });

  if (!(await exists(srcSvg))) {
    console.error(`❌ Missing source SVG: ${srcSvg}`);
    process.exit(1);
  }

  const svg = await fs.readFile(srcSvg);

  await makePng(svg, 16, out.png16);
  await makePng(svg, 32, out.png32);
  await makePng(svg, 180, out.apple180);
  await makePng(svg, 192, out.android192);
  await makePng(svg, 512, out.android512);

  const icoBuf = await toIco([
    await sharp(svg).resize(16, 16).png().toBuffer(),
    await sharp(svg).resize(32, 32).png().toBuffer(),
    await sharp(svg).resize(48, 48).png().toBuffer(),
  ]);
  await fs.writeFile(out.ico, icoBuf);

  const manifest = {
    name: "Shadow Arena",
    short_name: "ShadowArena",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    theme_color: "#0a0a12",
    background_color: "#0a0a12",
    display: "standalone",
  };

  await fs.writeFile(
    out.webmanifest,
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  console.log("✅ Favicons generated in /public");
}

run().catch((err) => {
  console.error("❌ Failed to generate favicons:", err);
  process.exit(1);
});
