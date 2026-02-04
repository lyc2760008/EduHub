// Configurable parent auth throttle thresholds (per-tenant + per-email).
// Tune these values to balance brute-force protection vs. parent convenience.
export const MAX_ATTEMPTS_PER_WINDOW = 5;
export const WINDOW_SECONDS = 10 * 60;
export const COOLDOWN_SECONDS = 15 * 60;
