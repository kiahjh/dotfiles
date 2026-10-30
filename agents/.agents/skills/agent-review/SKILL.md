---
name: agent-review
description: Use when the user asks you to review changes.
---

# Agent Review

Have a subagent do the review on a different model from the one that built the changes, for a second opinion. Use `xhigh` reasoning.

- If you're a Claude model, use GPT-6 Astra (`openai/gpt-6-astra#xhigh`).
- If you're a GPT model, use Opus 5.5 (`claude-agent/opus#xhigh`).
