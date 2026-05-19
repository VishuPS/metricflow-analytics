function startScheduler({ loadState, saveState, ingestSource, generateRollups, intervalMs = 60_000 }) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const state = await loadState();
      if (!shouldRun(state.schedule)) return;

      const sources = Array.isArray(state.schedule.sources) ? state.schedule.sources : ["linkedin"];
      for (const source of sources) {
        if (state.sources?.[source]?.connected) await ingestSource(source);
      }

      const nextState = await loadState();
      generateRollups(nextState);
      nextState.schedule = {
        ...nextState.schedule,
        lastRunAt: new Date().toISOString()
      };
      await saveState(nextState);
    } catch (error) {
      console.error(`Scheduler error: ${error.message}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}

function shouldRun(schedule = {}) {
  if (!schedule.autoIngest) return false;
  const lastRunAt = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : 0;
  const elapsed = Date.now() - lastRunAt;
  const interval = scheduleIntervalMs(schedule.frequency);
  return elapsed >= interval;
}

function scheduleIntervalMs(frequency = "Weekly") {
  const value = String(frequency).toLowerCase();
  if (value === "daily") return 24 * 60 * 60 * 1000;
  if (value === "monthly") return 30 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

module.exports = {
  startScheduler,
  shouldRun
};
