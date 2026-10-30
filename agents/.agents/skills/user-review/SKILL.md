---
name: user-review
description: Prepare or refresh an agent-curated browser review of code changes, a PR, or a scoped feature.
---

# User review

Build a useful reading path through captured changes, not an automated reviewer report.

Establish the repository and comparison first. Use `user-review --help` for flags
and [readme.md](readme.md) for setup, comparison semantics, and the plan format.
The bundled CLI is `app/bin/user-review.mjs`, runnable with Node if the launcher is missing.

```sh
user-review capture --repo /absolute/path/to/repo --id feature-name
user-review inspect feature-name
# Inspect the captured source and write a curated plan.
user-review plan feature-name --file /absolute/path/to/plan.json
user-review open feature-name
```

Group changes in a useful conceptual order. Keep titles short; add prose only
for connections or decisions that the diff doesn't explain. Reference captured
unit IDs, with every unit exactly once. Mechanical changes can start collapsed.
Install a valid plan before handing over the URL and a brief scope summary.

For later revisions, capture with the same review ID and curate the new snapshot
again. Each capture starts with a file-order draft, not the previous curated plan.

The user owns notes and reviewed status. Export notes verbatim with `user-review notes ID`;
feedback isn't blanket permission to change code. Keep draft plans outside the
reviewed repository, and use the demo or isolated tests for UI experiments.
