const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const FILES = ["index.html", "app.js", "styles.css"];

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  await Promise.all(FILES.map((file) => (
    fs.copyFile(path.join(ROOT, file), path.join(DIST, file))
  )));

  console.log(`Cloudflare static assets written to ${DIST}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
