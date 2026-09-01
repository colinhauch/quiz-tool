---
name: commit
description: Examine current changes and create properly structured commits following Conventional Commits. Use this skill whenever the user asks to commit, wants to save their work, says "let's commit", mentions staging files, or asks about commit messages — even if they don't explicitly say "conventional commits".
---

Examine all current repository changes and create properly structured commits following the Conventional Commits specification.

## Step 1: Analyze changes

Run in parallel:
- `git status`
- `git diff`
- `git diff --cached`

## Step 2: Group changes logically

Organize into separate commits by type, scope, and relatedness. Keep commits atomic.

## Step 3: Create commits

For each logical group:
1. Stage relevant files with `git add <files>`
2. Commit using HEREDOC format:
   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): description

   Optional body explaining what and why.
   EOF
   )"
   ```
3. Run `git status` to verify

### Rules
- Use standard Conventional Commits types (`feat`, `fix`, `docs`, `test`, `refactor`, `chore`, etc.)
- Description: present tense, imperative, lowercase, no period, ≤50 chars.
- Body: explain WHAT and WHY, wrap at 72 chars. Avoid using a body for simple commits.
- Breaking changes: add `!` after type (`feat!:`)
- Do NOT include "Co-Authored-By" or "Generated with Claude Code" in commit messages
- Don't commit if no changes exist
