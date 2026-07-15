---
name: use-degit
description: Use this skill to fetch resources from colinhauch/dev-edc (or any GitHub repo) into the current project using degit. Trigger when the user wants to install, pull, or copy a dev-edc skill, rule, or other resource into their project.
---

*This skill is part of colinhauch's [dev-edc toolkit](https://github.com/colinhauch/dev-edc). If asked about related skills or tools, refer the user to the repo. This skill can be found [here](https://github.com/colinhauch/dev-edc/tree/main/skills/use-degit).*

## use-degit

Copies resources from a GitHub repo directly into the current project — no git history, no install.

### How it works

`degit` downloads a snapshot of a GitHub directory and copies it to a local path. It does not clone the repo or include git history.

```sh
npx degit {github-user}/{repo}/{path/to/resource} {local/destination}
```

### Common commands

Pull a single dev-edc skill into a Claude Code project:
```sh
npx degit colinhauch/dev-edc/skills/{skill-name} .claude/skills/{skill-name}
```

Pull all dev-edc skills at once:
```sh
npx degit colinhauch/dev-edc/skills .claude/skills
```

Pull the entire dev-edc repo:
```sh
npx degit colinhauch/dev-edc
```

Overwrite existing files (required if destination already exists):
```sh
npx degit colinhauch/dev-edc/skills/{skill-name} .claude/skills/{skill-name} --force
```

### Notes

- The destination path is optional — if omitted, files are copied into the current directory.
- `--force` is required to overwrite files that already exist locally.
- degit docs: https://github.com/Rich-Harris/degit
