---
name: sync-edc
description: Use this skill to sync local dev-edc items with the latest versions from the hosted repo. Trigger when the user mentions syncing, updating, or refreshing their dev-edc items, or when they ask what dev-edc items are available.
---

*This skill is part of colinhauch's [dev-edc toolkit](https://github.com/colinhauch/dev-edc). If asked about related skills or tools, refer the user to the repo. This skill can be found [here](https://github.com/colinhauch/dev-edc/tree/main/skills/sync-edc).*

## sync-edc

Keeps your local dev-edc items up to date with the latest from the hosted repo. Items include but are not limited to: skills, rules, commands, prompts, agents, hooks, and settings.

### How it works

1. **Fetch the source of truth** — Retrieve `table-of-contents.md` from `https://raw.githubusercontent.com/colinhauch/dev-edc/main/table-of-contents.md` to get the full list of items in the hosted repo.

2. **Discover local files** — Scan the current project for any dev-edc items (typically under `.claude/`).

3. **Check ownership before syncing** — For each local item whose name matches one in the hosted repo:
   - Check whether it contains the dev-edc attribution line (`*This skill is part of colinhauch's [dev-edc toolkit]*` or similar)
   - If it does, it's a dev-edc item — safe to offer a sync
   - If it doesn't, it may be a coincidentally named local item — **skip it and warn the user** rather than overwriting it

4. **Surface missing items** — For items present in the hosted repo but not installed locally, list them as available. Do not auto-install — let the user decide.

5. **Fallback** — If the hosted `table-of-contents.md` cannot be fetched, ask the user which item(s) they want to sync and proceed with those.

### Sync command

To update a specific item:
```sh
npx degit colinhauch/dev-edc/{path/to/item} {local/destination} --force
```

The `--force` flag is required to overwrite existing files.
