# AGENTS.md

## Project overview

`ticket-amend` is a plugin for the [tk](https://github.com/wedow/ticket) CLI ticket tracker. It provides a single command — `tk amend` — that modifies fields on existing tickets stored as markdown files with YAML frontmatter in a `.tickets/` directory.

## Repository layout

```
ticket-amend/
├── bin/ticket-amend.js   # CLI entry point (zero dependencies, Node built-ins only)
├── test/amend.test.js    # Tests using node:test and node:assert
├── package.json          # npm package with "ticket-amend" bin
├── README.md
└── AGENTS.md
```

## How it works

1. `tk` discovers executables named `ticket-<cmd>` or `tk-<cmd>` on PATH and invokes them as subcommands.
2. `npm install -g ticket-amend` places `ticket-amend` on PATH, making `tk amend` work.
3. When invoked, `tk` exports `TICKETS_DIR` (path to `.tickets/`) and `TK_SCRIPT` (path to the `tk` executable) as environment variables.
4. The plugin can also find `.tickets/` on its own by walking parent directories from cwd, so it works standalone too.

## Ticket file format

Tickets are markdown files in `.tickets/<id>.md` with YAML frontmatter:

```markdown
---
id: ab-1234
status: open
deps: []
links: []
created: 2026-01-01T00:00:00Z
type: task
priority: 2
assignee: Alice
external-ref: gh-123
parent: cd-5678
tags: [backend, api]
---
# Ticket title

Description text here.
```

## Key behaviors

- **Description** (`-d`): appends to the markdown body after the frontmatter.
- **Tags** (`--tags`): appends to the existing tag list, skipping duplicates.
- **All other fields** (`-t`, `-p`, `-a`, `--external-ref`, `--parent`): replace the current value in frontmatter.
- **Partial ID matching**: ticket IDs can be shortened (e.g. `5c4` matches `nw-5c46`). Ambiguous matches are rejected.
- **Parent resolution**: the `--parent` value is also resolved via partial ID matching.

## Plugin protocol

- `ticket-amend --tk-describe` outputs `tk-plugin: Amend fields on an existing ticket` for plugin discovery.
- `ticket-amend --help` or `ticket-amend` (no args) prints usage.
- Exit code 0 on success, non-zero on error.

## Development

### Running tests

```bash
npm test
```

Tests use `node:test` and `node:assert` (no external dependencies). Each test creates a temporary `.tickets/` directory, runs the CLI as a subprocess, and verifies the resulting file contents.

### Design constraints

- Zero npm dependencies. Only Node.js built-in modules (`fs`, `path`, `os`, `child_process`).
- The frontmatter parser preserves field ordering and unrecognized lines.
- Tests run the actual CLI binary via `execFileSync` for realistic end-to-end coverage.
