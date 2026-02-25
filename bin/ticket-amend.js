#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- arg parsing ---

const args = process.argv.slice(2);

if (args.includes('--tk-describe')) {
  console.log('tk-plugin: Amend fields on an existing ticket');
  process.exit(0);
}

if (args.includes('-h') || args.includes('--help') || args.length === 0) {
  const usage = `Usage: ticket-amend <id> [options]

Amend fields on an existing ticket.

Options:
  -d, --description TEXT    Append to description
  -t, --type TYPE           Set type (bug, feature, task, epic, chore)
  -p, --priority NUM        Set priority (0-4)
  -a, --assignee NAME       Set assignee
  --external-ref REF        Set external reference
  --parent ID               Set parent ticket
  --tags TAG1,TAG2          Append tags
  -h, --help                Show this help`;
  console.log(usage);
  process.exit(0);
}

let id = null;
let description = null;
let type = null;
let priority = null;
let assignee = null;
let externalRef = null;
let parent = null;
let tags = null;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '-d': case '--description':
      description = args[++i]; break;
    case '-t': case '--type':
      type = args[++i]; break;
    case '-p': case '--priority':
      priority = args[++i]; break;
    case '-a': case '--assignee':
      assignee = args[++i]; break;
    case '--external-ref':
      externalRef = args[++i]; break;
    case '--parent':
      parent = args[++i]; break;
    case '--tags':
      tags = args[++i]; break;
    default:
      if (args[i].startsWith('-')) {
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
      }
      if (!id) id = args[i];
      break;
  }
}

if (!id) {
  console.error('Error: ticket ID is required');
  process.exit(1);
}

// --- ticket resolution ---

// Walk parent directories looking for .tickets, mirroring tk's find_tickets_dir
function findTicketsDir() {
  // Explicit env var takes priority (tk sets this before invoking plugins)
  const envDir = process.env.TICKETS_DIR;
  if (envDir) return envDir;

  // Walk parents looking for .tickets
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, '.tickets');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  console.error('Error: no .tickets directory found (searched parent directories)');
  console.error("Run 'tk create' to initialize, or set TICKETS_DIR env var");
  process.exit(1);
}

const ticketsDir = findTicketsDir();

function resolveTicket(id) {
  const exact = path.join(ticketsDir, `${id.trim()}.md`);
  if (fs.existsSync(exact)) return exact;

  let entries;
  try {
    entries = fs.readdirSync(ticketsDir);
  } catch {
    console.error(`Error: cannot read ${ticketsDir}`);
    process.exit(1);
  }

  const matches = entries.filter(
    (f) => f.endsWith('.md') && f.includes(id.trim())
  );

  if (matches.length === 1) return path.join(ticketsDir, matches[0]);
  if (matches.length > 1) {
    console.error(`Error: ambiguous ID '${id}' matches multiple tickets`);
    process.exit(1);
  }
  console.error(`Error: ticket '${id}' not found`);
  process.exit(1);
}

const ticketFile = resolveTicket(id);

// --- frontmatter parsing ---

const content = fs.readFileSync(ticketFile, 'utf8');
const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!fmMatch) {
  console.error('Error: ticket has no valid frontmatter');
  process.exit(1);
}

const frontmatterRaw = fmMatch[1];
const body = fmMatch[2];

// Parse frontmatter lines into ordered key-value pairs
const fmLines = frontmatterRaw.split('\n');
const fields = [];
for (const line of fmLines) {
  const m = line.match(/^([a-z][a-z0-9-]*): ?(.*)$/);
  if (m) {
    fields.push({ key: m[1], value: m[2] });
  } else {
    // Preserve lines that don't match (e.g. blank or continuation)
    fields.push({ raw: line });
  }
}

function getField(key) {
  const f = fields.find((f) => f.key === key);
  return f ? f.value : null;
}

function setField(key, value) {
  const idx = fields.findIndex((f) => f.key === key);
  if (idx !== -1) {
    fields[idx].value = value;
  } else {
    fields.push({ key, value });
  }
}

// --- apply amendments ---

let changed = false;

if (type !== null) {
  setField('type', type);
  changed = true;
}

if (priority !== null) {
  setField('priority', priority);
  changed = true;
}

if (assignee !== null) {
  setField('assignee', assignee);
  changed = true;
}

if (externalRef !== null) {
  setField('external-ref', externalRef);
  changed = true;
}

if (parent !== null) {
  // Resolve parent to full ID
  const parentFile = resolveTicket(parent);
  const resolvedParent = path.basename(parentFile, '.md');
  setField('parent', resolvedParent);
  changed = true;
}

if (tags !== null) {
  const existing = getField('tags');
  let existingTags = [];
  if (existing) {
    // Parse [tag1, tag2] or tag1,tag2 format
    const cleaned = existing.replace(/^\[|\]$/g, '');
    existingTags = cleaned
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  const newTags = tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  // Append only tags that don't already exist
  for (const t of newTags) {
    if (!existingTags.includes(t)) existingTags.push(t);
  }
  setField('tags', `[${existingTags.join(', ')}]`);
  changed = true;
}

// Description appends to body
let newBody = body;
if (description !== null) {
  // Append after existing body content
  const trimmed = body.trimEnd();
  newBody = trimmed + '\n\n' + description + '\n';
  changed = true;
}

if (!changed) {
  console.error('Nothing to amend (no options provided)');
  process.exit(1);
}

// --- write back ---

const newFrontmatter = fields
  .map((f) => (f.raw !== undefined ? f.raw : `${f.key}: ${f.value}`))
  .join('\n');

const output = `---\n${newFrontmatter}\n---\n${newBody}`;
fs.writeFileSync(ticketFile, output, 'utf8');

const ticketId = path.basename(ticketFile, '.md');
console.log(`Amended ${ticketId}`);
