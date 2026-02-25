'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const BIN = path.resolve(__dirname, '..', 'bin', 'ticket-amend.js');

function makeTicket(opts = {}) {
  const {
    id = 'ab-1234',
    status = 'open',
    type = 'task',
    priority = '2',
    assignee = 'Alice',
    tags = null,
    externalRef = null,
    parent = null,
    body = '# Test ticket\n\nOriginal description\n',
  } = opts;

  let fm = '';
  fm += `id: ${id}\n`;
  fm += `status: ${status}\n`;
  fm += `deps: []\n`;
  fm += `links: []\n`;
  fm += `created: 2026-01-01T00:00:00Z\n`;
  fm += `type: ${type}\n`;
  fm += `priority: ${priority}\n`;
  fm += `assignee: ${assignee}\n`;
  if (externalRef) fm += `external-ref: ${externalRef}\n`;
  if (parent) fm += `parent: ${parent}\n`;
  if (tags) fm += `tags: [${tags.join(', ')}]\n`;

  return `---\n${fm}---\n${body}`;
}

function setupDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-amend-test-'));
  const ticketsDir = path.join(tmp, '.tickets');
  fs.mkdirSync(ticketsDir);
  return { tmp, ticketsDir };
}

function writeTicket(ticketsDir, id, content) {
  fs.writeFileSync(path.join(ticketsDir, `${id}.md`), content);
}

function readTicket(ticketsDir, id) {
  return fs.readFileSync(path.join(ticketsDir, `${id}.md`), 'utf8');
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z][a-z0-9-]*): ?(.*)$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  return { fields, body: m[2] };
}

function run(ticketsDir, args, opts = {}) {
  const env = { ...process.env };
  if (ticketsDir !== undefined) {
    env.TICKETS_DIR = ticketsDir;
  } else {
    delete env.TICKETS_DIR;
  }
  return execFileSync(process.execPath, [BIN, ...args], {
    env,
    encoding: 'utf8',
    timeout: 5000,
    cwd: opts.cwd,
  });
}

function runFail(ticketsDir, args, opts = {}) {
  try {
    const env = { ...process.env };
    if (ticketsDir !== undefined) {
      env.TICKETS_DIR = ticketsDir;
    } else {
      delete env.TICKETS_DIR;
    }
    execFileSync(process.execPath, [BIN, ...args], {
      env,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: opts.cwd,
    });
    assert.fail('Expected command to fail');
  } catch (e) {
    return { stderr: e.stderr, status: e.status };
  }
}

// --- tests ---

describe('ticket-amend', () => {
  let tmp, ticketsDir;

  beforeEach(() => {
    ({ tmp, ticketsDir } = setupDir());
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('meta', () => {
    it('--help shows usage', () => {
      const out = execFileSync(process.execPath, [BIN, '--help'], {
        encoding: 'utf8',
      });
      assert.match(out, /Usage: ticket-amend/);
      assert.match(out, /--description/);
    });

    it('--tk-describe outputs plugin description', () => {
      const out = execFileSync(process.execPath, [BIN, '--tk-describe'], {
        encoding: 'utf8',
      });
      assert.match(out, /^tk-plugin:/);
    });

    it('no args shows help', () => {
      const out = execFileSync(process.execPath, [BIN], {
        encoding: 'utf8',
      });
      assert.match(out, /Usage:/);
    });
  });

  describe('replace fields', () => {
    it('amends type', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '-t', 'bug']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.type, 'bug');
    });

    it('amends priority', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '-p', '0']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.priority, '0');
    });

    it('amends assignee', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '-a', 'Bob']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.assignee, 'Bob');
    });

    it('sets external-ref when not present', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '--external-ref', 'gh-99']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields['external-ref'], 'gh-99');
    });

    it('replaces external-ref when present', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket({ externalRef: 'gh-1' }));
      run(ticketsDir, ['ab-1234', '--external-ref', 'JIRA-500']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields['external-ref'], 'JIRA-500');
    });

    it('sets parent with ID resolution', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      writeTicket(ticketsDir, 'cd-5678', makeTicket({ id: 'cd-5678' }));
      run(ticketsDir, ['ab-1234', '--parent', 'cd']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.parent, 'cd-5678');
    });
  });

  describe('append fields', () => {
    it('appends description to body', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '-d', 'Extra info']);
      const { body } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.match(body, /Original description/);
      assert.match(body, /Extra info/);
    });

    it('appends description multiple times', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '-d', 'First addition']);
      run(ticketsDir, ['ab-1234', '-d', 'Second addition']);
      const { body } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.match(body, /Original description/);
      assert.match(body, /First addition/);
      assert.match(body, /Second addition/);
    });

    it('appends tags to existing', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket({ tags: ['backend', 'api'] }));
      run(ticketsDir, ['ab-1234', '--tags', 'frontend,urgent']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.tags, '[backend, api, frontend, urgent]');
    });

    it('deduplicates appended tags', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket({ tags: ['backend', 'api'] }));
      run(ticketsDir, ['ab-1234', '--tags', 'api,frontend']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.tags, '[backend, api, frontend]');
    });

    it('adds tags when none exist', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '--tags', 'new-tag']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.tags, '[new-tag]');
    });
  });

  describe('partial ID matching', () => {
    it('resolves partial ID', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      const out = run(ticketsDir, ['1234', '-t', 'epic']);
      assert.match(out, /Amended ab-1234/);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.type, 'epic');
    });

    it('resolves prefix', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      const out = run(ticketsDir, ['ab', '-p', '4']);
      assert.match(out, /Amended ab-1234/);
    });
  });

  describe('multiple amendments at once', () => {
    it('applies all changes in one call', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket({ tags: ['old'] }));
      run(ticketsDir, [
        'ab-1234',
        '-t', 'feature',
        '-p', '0',
        '-a', 'Charlie',
        '--external-ref', 'gh-7',
        '--tags', 'new',
        '-d', 'More context',
      ]);
      const { fields, body } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.type, 'feature');
      assert.equal(fields.priority, '0');
      assert.equal(fields.assignee, 'Charlie');
      assert.equal(fields['external-ref'], 'gh-7');
      assert.equal(fields.tags, '[old, new]');
      assert.match(body, /More context/);
    });
  });

  describe('preserves structure', () => {
    it('preserves unmodified frontmatter fields', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '-t', 'bug']);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.id, 'ab-1234');
      assert.equal(fields.status, 'open');
      assert.equal(fields.deps, '[]');
      assert.equal(fields.links, '[]');
      assert.equal(fields.created, '2026-01-01T00:00:00Z');
      assert.equal(fields.assignee, 'Alice');
      assert.equal(fields.priority, '2');
    });

    it('preserves body when only frontmatter changes', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      run(ticketsDir, ['ab-1234', '-t', 'bug']);
      const { body } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.match(body, /# Test ticket/);
      assert.match(body, /Original description/);
    });
  });

  describe('errors', () => {
    it('fails on ambiguous ID', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      writeTicket(ticketsDir, 'ab-5678', makeTicket({ id: 'ab-5678' }));
      const { stderr, status } = runFail(ticketsDir, ['ab', '-t', 'bug']);
      assert.match(stderr, /ambiguous/i);
      assert.notEqual(status, 0);
    });

    it('fails on unknown ticket', () => {
      const { stderr, status } = runFail(ticketsDir, ['zz-9999', '-t', 'bug']);
      assert.match(stderr, /not found/i);
      assert.notEqual(status, 0);
    });

    it('fails with no options', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      const { stderr, status } = runFail(ticketsDir, ['ab-1234']);
      assert.match(stderr, /nothing to amend/i);
      assert.notEqual(status, 0);
    });

    it('fails on unknown flag', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      const { stderr, status } = runFail(ticketsDir, ['ab-1234', '--bogus']);
      assert.match(stderr, /unknown option/i);
      assert.notEqual(status, 0);
    });

    it('fails when no .tickets dir found anywhere', () => {
      const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-no-tickets-'));
      try {
        const { stderr, status } = runFail(undefined, ['ab-1234', '-t', 'bug'], { cwd: bare });
        assert.match(stderr, /no .tickets directory found/i);
        assert.notEqual(status, 0);
      } finally {
        fs.rmSync(bare, { recursive: true, force: true });
      }
    });
  });

  describe('directory ascending', () => {
    it('finds .tickets in parent directory when cwd is a subdirectory', () => {
      // tmp/.tickets/ab-1234.md exists, cwd is tmp/sub/deep
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      const deep = path.join(tmp, 'sub', 'deep');
      fs.mkdirSync(deep, { recursive: true });

      const out = run(undefined, ['ab-1234', '-t', 'epic'], { cwd: deep });
      assert.match(out, /Amended ab-1234/);
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.type, 'epic');
    });

    it('finds .tickets in grandparent directory', () => {
      writeTicket(ticketsDir, 'ab-1234', makeTicket());
      const deep = path.join(tmp, 'a', 'b', 'c');
      fs.mkdirSync(deep, { recursive: true });

      run(undefined, ['ab-1234', '-p', '0'], { cwd: deep });
      const { fields } = parseFrontmatter(readTicket(ticketsDir, 'ab-1234'));
      assert.equal(fields.priority, '0');
    });

    it('prefers TICKETS_DIR env var over directory walk', () => {
      // Create two .tickets dirs: one via env, one via parent walk
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-other-'));
      const otherTickets = path.join(other, '.tickets');
      fs.mkdirSync(otherTickets);
      writeTicket(otherTickets, 'xx-9999', makeTicket({ id: 'xx-9999' }));
      writeTicket(ticketsDir, 'ab-1234', makeTicket());

      try {
        // Set TICKETS_DIR to otherTickets, cwd under tmp (which also has .tickets)
        const out = run(otherTickets, ['xx-9999', '-t', 'bug'], { cwd: tmp });
        assert.match(out, /Amended xx-9999/);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });
  });
});
