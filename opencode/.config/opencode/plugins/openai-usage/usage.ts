export interface Usage {
  status: "ok" | "unavailable";
  message: string;
  remaining: number | null;
  resetAt: number | null;
  banked: number | null;
  fetchedAt: number;
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCodexUsage(data: unknown, now = Date.now()): Usage {
  if (!record(data)) throw new Error("Missing Codex usage response");
  const limits = record(data.rateLimitsByLimitId) && record(data.rateLimitsByLimitId.codex)
    ? data.rateLimitsByLimitId.codex : data.rateLimits;
  if (!record(limits)) throw new Error("Missing Codex usage limits");
  const window = (value: unknown) => record(value) ? {
    used_percent: value.usedPercent,
    limit_window_seconds: typeof value.windowDurationMins === "number" ? value.windowDurationMins * 60 : null,
    reset_at: value.resetsAt,
  } : null;
  return parseUsage({
    rate_limit: { primary_window: window(limits.primary), secondary_window: window(limits.secondary) },
    rate_limit_reset_credits: record(data.rateLimitResetCredits)
      ? { available_count: data.rateLimitResetCredits.availableCount } : null,
  }, now);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseUsage(data: unknown, now = Date.now()): Usage {
  if (!record(data) || !record(data.rate_limit)) throw new Error("Missing usage windows");
  const window = [data.rate_limit.primary_window, data.rate_limit.secondary_window].find(
    (value) => record(value) && finite(value.limit_window_seconds) &&
      value.limit_window_seconds >= 5 * 86400 && value.limit_window_seconds <= 8 * 86400 &&
      finite(value.used_percent),
  );
  if (!record(window) || !finite(window.used_percent)) throw new Error("Missing weekly usage window");
  const resetAt = finite(window.reset_at) && window.reset_at > 0
    ? window.reset_at * 1000
    : finite(window.reset_after_seconds) && window.reset_after_seconds >= 0
      ? now + window.reset_after_seconds * 1000
      : null;
  const credits = data.rate_limit_reset_credits;
  const banked = record(credits) && Number.isInteger(credits.available_count) &&
    (credits.available_count as number) >= 0 ? credits.available_count as number : null;
  return {
    status: "ok", message: "", fetchedAt: now,
    remaining: Math.round(100 - Math.max(0, Math.min(100, window.used_percent))),
    resetAt, banked,
  };
}

export function formatUsage(usage: Usage, now = Date.now()): string {
  if (usage.status !== "ok") return "[ unavailable ]";
  if (usage.resetAt !== null && usage.resetAt <= now) return "[ refreshing… ]";
  const day = usage.resetAt === null ? "" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(usage.resetAt);
  const time = usage.resetAt === null ? "" : new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(usage.resetAt);
  const reset = usage.resetAt === null ? "reset time unknown" : `${day} ${time}`;
  const banked = usage.banked !== null && usage.banked > 0
    ? ` | ${usage.banked} ${usage.banked === 1 ? "reset" : "resets"}` : "";
  return `[ ${usage.remaining}% | ${reset}${banked} ]`;
}
