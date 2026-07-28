/**
 * Minimal logging wrapper — centralizes output so call sites use logger.info/
 * logger.error instead of bare console.*, and gives one place to swap in a
 * real logging library (winston/pino) later without touching every file.
 * Intentionally dependency-free: this is a small, low-traffic bot and a full
 * logging library would be disproportionate footprint for it right now.
 */
const logger = {
  info: (...args) => console.log(new Date().toISOString(), "[info]", ...args),
  error: (...args) => console.error(new Date().toISOString(), "[error]", ...args),
};

module.exports = { logger };
