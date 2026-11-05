---
name: session-history
description: Use when the user asks about past OpenCode sessions on this Mac, such as finding an old conversation, reading a previous transcript, or checking what an earlier session did.
---

# Session history

All OpenCode sessions live in one SQLite database:
`~/.local/share/opencode/opencode.db`. It's large and in use, so always open it read-only:

```sh
DB=~/.local/share/opencode/opencode.db
sqlite3 -readonly "file:$DB?mode=ro" "<query>"
```

Times are Unix milliseconds: `datetime(time_created/1000,'unixepoch','localtime')`.

## Tables

- **`session_v2`**: every session (`id`, `title`, `directory`, `time_created`,
  `parent_id` for subagents). Use this one; the older `session` table stops in mid-2026.
- **`session_message`**: one row per message (`session_id`, `type`, `seq`, `data` JSON).
  - `type='user'`: the text is `json_extract(data,'$.text')`.
  - `type='assistant'`: `data.content` is an array of `text`, `tool` and `reasoning`
    items. Expand it with `json_each(data,'$.content')`.
  - Other types (`idle`, `synthetic`, `system`, `compaction`) are bookkeeping.
- `message`/`part` hold pre-v2 sessions with the same idea.

## Recipes

```sql
-- find sessions by title or folder
select id, datetime(time_created/1000,'unixepoch','localtime'), title, directory
from session_v2 where title like '%demo%' order by time_created desc limit 20;

-- read a session's conversation (user text + assistant text, in order)
select m.seq, m.type,
  coalesce(json_extract(m.data,'$.text'), json_extract(j.value,'$.text'))
from session_message m
left join json_each(m.data,'$.content') j
  on m.type='assistant' and json_extract(j.value,'$.type')='text'
where m.session_id='<id>' and m.type in ('user','assistant')
order by m.seq;
```

Transcripts can contain secrets and personal data; quote only what the task needs.
