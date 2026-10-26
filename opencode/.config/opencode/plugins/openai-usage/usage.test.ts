import { describe, expect, test } from "bun:test";
import { formatUsage, parseCodexUsage, parseUsage } from "./usage";

const now = Date.UTC(2026, 9, 26, 12);
const weekly = { limit_window_seconds: 604800, used_percent: 37, reset_at: now / 1000 + 86400 };

describe("OpenAI weekly usage", () => {
  test("uses the compact weekday and time format with optional reset count", () => {
    const usage = {
      status: "ok" as const, message: "", remaining: 55,
      resetAt: new Date(2026, 10, 2, 2, 7).getTime(), banked: 0, fetchedAt: now,
    };
    expect(formatUsage(usage, now)).toBe("[ 55% | Mon 2:07 AM ]");
    expect(formatUsage({ ...usage, banked: null }, now)).toBe("[ 55% | Mon 2:07 AM ]");
    expect(formatUsage({ ...usage, banked: 1 }, now)).toBe("[ 55% | Mon 2:07 AM | 1 reset ]");
    expect(formatUsage({ ...usage, banked: 2 }, now)).toBe("[ 55% | Mon 2:07 AM | 2 resets ]");
  });
  test("reads the Codex app-server response, preferring the codex bucket", () => {
    const usage = parseCodexUsage({
      rateLimits: { primary: { usedPercent: 99, windowDurationMins: 10080, resetsAt: now / 1000 + 60 } },
      rateLimitsByLimitId: { codex: {
        primary: { usedPercent: 45, windowDurationMins: 10080, resetsAt: now / 1000 + 86400 },
      } },
      rateLimitResetCredits: { availableCount: 3 },
    }, now);
    expect(usage.remaining).toBe(55);
    expect(usage.resetAt).toBe(now + 86400_000);
    expect(usage.banked).toBe(3);
  });
  test("supports older Codex responses without the bucket map or reset credits", () => {
    const usage = parseCodexUsage({ rateLimits: {
      secondary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: null },
    } }, now);
    expect(usage.remaining).toBe(90);
    expect(usage.resetAt).toBeNull();
    expect(usage.banked).toBeNull();
    expect(() => parseCodexUsage({})).toThrow();
  });
  test("finds weekly windows in either position and reads reset credits", () => {
    for (const position of ["primary_window", "secondary_window"]) {
      const usage = parseUsage({
        rate_limit: { [position]: weekly }, rate_limit_reset_credits: { available_count: 2 },
      }, now);
      expect(usage.remaining).toBe(63);
      expect(usage.resetAt).toBe(now + 86400_000);
      expect(usage.banked).toBe(2);
      expect(formatUsage(usage, now)).toContain(" | 2 resets ]");
      expect(formatUsage(usage, now)).not.toContain("week:");
    }
  });
  test("omits banked resets when zero or unreported", () => {
    for (const credits of [undefined, { available_count: 0 }, { available_count: -1 }]) {
      expect(formatUsage(parseUsage({ rate_limit: { primary_window: weekly }, rate_limit_reset_credits: credits }, now), now))
        .not.toMatch(/\b\d+ resets?\b/);
    }
  });
  test("falls back to relative reset time and clamps usage", () => {
    const usage = parseUsage({ rate_limit: { primary_window: { ...weekly, used_percent: 150, reset_at: null, reset_after_seconds: 60 } } }, now);
    expect(usage.remaining).toBe(0);
    expect(usage.resetAt).toBe(now + 60_000);
    expect(formatUsage(usage, now + 60_001)).toContain("refreshing");
  });
  test("does not mistake a five-hour limit for weekly usage", () => {
    expect(() => parseUsage({ rate_limit: { primary_window: { ...weekly, limit_window_seconds: 18000 } } })).toThrow();
    expect(() => parseUsage(null)).toThrow();
    expect(() => parseUsage({ rate_limit: { primary_window: { ...weekly, used_percent: NaN } } })).toThrow();
  });
  test("keeps unavailable and unknown reset states compact", () => {
    const usage = parseUsage({ rate_limit: { primary_window: weekly } }, now);
    expect(formatUsage({ ...usage, status: "unavailable" }, now)).toBe("[ unavailable ]");
    expect(formatUsage({ ...usage, resetAt: null }, now)).toBe("[ 63% | reset time unknown ]");
  });
});
