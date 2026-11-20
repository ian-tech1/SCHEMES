export const OWNER_DESK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const DEPUTY_DESK_WINDOW_MS = 10 * 60 * 1000;
export const OWNER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_REFRESH_AGE_SECONDS = 24 * 60 * 60;

export function deskWindowMs(role: string): number {
  return role === "admin" ? OWNER_DESK_WINDOW_MS : DEPUTY_DESK_WINDOW_MS;
}

export function rollingDeskExpiry(role: string, now = Date.now()): Date {
  return new Date(now + deskWindowMs(role));
}
