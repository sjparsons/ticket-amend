# ticket-amend

A plugin for [tk](https://github.com/wedow/ticket) that amends fields on existing tickets.

Once installed, it's available as `tk amend`.

## Install

```bash
npm install -g ticket-amend
```

This puts `ticket-amend` on your PATH, which `tk` discovers automatically.

## Usage

```
tk amend <id> [options]
```

All options are optional. Partial ticket IDs work (e.g. `tk amend 5c4` matches `nw-5c46`).

### Options

| Flag | Short | Effect |
|------|-------|--------|
| `--description TEXT` | `-d` | Append text to the ticket body |
| `--type TYPE` | `-t` | Replace type (bug, feature, task, epic, chore) |
| `--priority NUM` | `-p` | Replace priority (0-4) |
| `--assignee NAME` | `-a` | Replace assignee |
| `--external-ref REF` | | Replace external reference (e.g. `gh-123`) |
| `--parent ID` | | Replace parent ticket (supports partial IDs) |
| `--tags TAG1,TAG2` | | Append tags (duplicates are skipped) |
| `--set KEY=VALUE` | | Replace any frontmatter field (repeatable) |
| `--append KEY=VALUE` | | Append to any list field (repeatable) |

### Append vs replace

- **Description**, **tags**, and **`--append`** append to existing values.
- Everything else (including **`--set`**) replaces the current value.

### Examples

```bash
# Change type and priority
tk amend nw-5c46 -t bug -p 0

# Add context to the description
tk amend 5c4 -d "Reproduced on Linux. Crash occurs on startup."

# Add tags without removing existing ones
tk amend 5c4 --tags "urgent,regression"

# Set parent and external reference
tk amend 5c4 --parent abc --external-ref JIRA-456

# Do it all at once
tk amend 5c4 -t bug -p 0 -a "Jane" -d "Details" --tags "critical"
```

### Arbitrary frontmatter

Use `--set` and `--append` to modify any frontmatter field, including custom ones:

```bash
# Set a custom field
tk amend 5c4 --set design="Use a queue-based approach"

# Replace multiple fields at once
tk amend 5c4 --set status=closed --set priority=0

# Append to a list field
tk amend 5c4 --append deps=other-ticket-id

# Mix with shorthand flags
tk amend 5c4 -t bug --set custom-field="some value"
```

## Directory resolution

Like `tk` itself, `ticket-amend` walks parent directories looking for a `.tickets/` folder. You can run it from any subdirectory of your project. The `TICKETS_DIR` environment variable takes priority when set (which `tk` does automatically when invoking plugins).

## Testing

```bash
npm test
```

Uses Node's built-in test runner (`node:test`). No dependencies.

## Requirements

- Node.js >= 18
- [tk](https://github.com/wedow/ticket) installed

## License

MIT
