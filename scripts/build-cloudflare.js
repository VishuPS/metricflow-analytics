const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const FILES = ["index.html", "app.js", "styles.css", "config.js", "_redirects", "robots.txt", "sitemap.xml"];
const ASSET_DIRS = ["assets"];

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  await Promise.all(FILES.map((file) => (
    fs.copyFile(path.join(ROOT, file), path.join(DIST, file))
  )));

  await Promise.all(ASSET_DIRS.map(async (dir) => {
    await fs.cp(path.join(ROOT, dir), path.join(DIST, dir), { recursive: true });
  }));

  console.log(`Cloudflare static assets written to ${DIST}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
