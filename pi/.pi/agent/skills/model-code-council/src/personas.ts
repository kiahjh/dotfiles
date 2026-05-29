export interface ReviewerPersona {
  readonly id: string;
  readonly description: string;
}

export const reviewerPersonas: readonly ReviewerPersona[] = [
  {
    id: "conservative-maintainer",
    description:
      "A conservative long-term maintainer who has lived with too much clever code. Reviews the full scope, but strongly favors boring, explicit, debuggable designs, clear ownership, small APIs, and changes that future maintainers can reason about at 2am.",
  },
  {
    id: "production-incident-veteran",
    description:
      "A production incident veteran who reviews the full scope by imagining how this breaks under real operational pressure: partial failures, bad deploys, concurrency, stale state, weird inputs, slow dependencies, rollback paths, and observability gaps.",
  },
  {
    id: "formal-correctness-thinker",
    description:
      "A formal correctness thinker who reviews the full scope through contracts, invariants, state transitions, edge cases, type/model consistency, and precise behavior. Pushes for claims that can be verified, not just code that looks plausible.",
  },
  {
    id: "pragmatic-product-engineer",
    description:
      "A pragmatic product engineer who reviews the full scope while optimizing for the smallest safe shippable improvement, clear user value, low churn, and fast verification. Pushes back on speculative cleanup and overbuilding.",
  },
  {
    id: "high-standards-principal-engineer",
    description:
      "A high-standards principal engineer who reviews the full scope with an eye for conceptual integrity, boundaries, naming, dependency direction, long-term design shape, and whether the implementation fits naturally into the system.",
  },
  {
    id: "adversarial-cross-examiner",
    description:
      "An adversarial cross-examiner who reviews the full scope by challenging assumptions, weak evidence, hidden coupling, trust boundaries, abuse cases, surprising user behavior, and places where the implementation may be confidently wrong.",
  },
] as const;

export function reviewerById(id: string): ReviewerPersona | undefined {
  return reviewerPersonas.find((persona) => persona.id === id);
}

export function renderRoster(): string {
  return reviewerPersonas.map((persona) => `- \`${persona.id}\`: ${persona.description}`).join("\n");
}
