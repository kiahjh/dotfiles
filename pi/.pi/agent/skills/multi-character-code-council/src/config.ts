import { join } from "node:path";

export type Environment = Record<string, string | undefined>;

export interface MccConfig {
  readonly skillDir: string;
  readonly reviewRoot: string;
  readonly piBin: string;
  readonly provider: string;
  readonly model: string;
  readonly reviewerThinking: "high";
  readonly chairThinking: "xhigh";
}

export function configFromEnv(skillDir: string, env: Environment = process.env): MccConfig {
  return {
    skillDir,
    reviewRoot: env.MCC_REVIEW_ROOT ?? join(env.HOME ?? "", ".local/share/pi/multi-character-code-council"),
    piBin: env.MCC_PI_BIN ?? "pi",
    provider: env.MCC_PROVIDER ?? "openai-codex",
    model: env.MCC_MODEL ?? "gpt-5.6-sol",
    reviewerThinking: "high",
    chairThinking: "xhigh",
  };
}
