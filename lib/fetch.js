async function getFetch() {
  if (globalThis.fetch) return globalThis.fetch.bind(globalThis);
  const module = await import("node-fetch");
  return module.default;
}

module.exports = { getFetch };
