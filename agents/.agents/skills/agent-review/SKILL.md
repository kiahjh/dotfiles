---
name: agent-review
description: Use when the user asks you to review changes.
---

# Agent Review

Have two subagents review the changes in parallel: GPT-6 Astra (`openai/gpt-6-astra#xhigh`) and Opus 5.5 (`claude-agent/opus#xhigh`).

On a later round, tell the reviewers what's already been decided and to focus on what changed since the last review.
