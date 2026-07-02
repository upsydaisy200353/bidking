#!/usr/bin/env node
/**
 * Push local git tree to GitHub via Git Data API (when git push fails).
 */
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const repo = process.argv[2] || 'upsydaisy200353/bidking';
const message =
  process.argv[3] ||
  execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim();
const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const files = execSync('git ls-files -z', { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

function readGitFile(path) {
  const clean = path.replace(/^"|"$/g, '');
  const result = spawnSync('git', ['show', `HEAD:${clean}`], {
    cwd: root,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git show failed for ${clean}: ${result.stderr?.toString()}`);
  }
  return result.stdout;
}

function ghApi(method, path, body) {
  const tmp = join(tmpdir(), `gh-api-${randomBytes(8).toString('hex')}.json`);
  const args = ['api', '-X', method, path];
  if (body !== undefined) {
    writeFileSync(tmp, JSON.stringify(body));
    args.push('--input', tmp);
  }
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (body !== undefined) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `gh api failed: ${path}`);
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

function isBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function createBlob(buf) {
  if (isBinary(buf)) {
    return ghApi('POST', `repos/${repo}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    }).sha;
  }
  return ghApi('POST', `repos/${repo}/git/blobs`, {
    content: buf.toString('utf8'),
    encoding: 'utf-8',
  }).sha;
}

console.log(`Pushing ${files.length} files to ${repo}...`);

const fileEntries = files.map((rawPath) => {
  const path = rawPath.replace(/^"|"$/g, '');
  const buf = readGitFile(rawPath);
  const sha = createBlob(buf);
  process.stdout.write('.');
  return { path, sha, mode: '100644' };
});
console.log('');

function buildTree(entries) {
  const rootTree = {};
  for (const { path, sha, mode } of entries) {
    const parts = path.split('/');
    let node = rootTree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        node[part] = { type: 'blob', sha, mode };
      } else {
        node[part] = node[part] || { type: 'tree', children: {} };
        node = node[part].children;
      }
    }
  }

  function createTreeFromNode(node) {
    const tree = [];
    for (const [name, entry] of Object.entries(node)) {
      if (entry.type === 'blob') {
        tree.push({ path: name, mode: entry.mode, type: 'blob', sha: entry.sha });
      } else {
        const subSha = createTreeFromNode(entry.children);
        tree.push({ path: name, mode: '040000', type: 'tree', sha: subSha });
      }
    }
    return ghApi('POST', `repos/${repo}/git/trees`, { tree }).sha;
  }

  return createTreeFromNode(rootTree);
}

const treeSha = buildTree(fileEntries);
const commit = ghApi('POST', `repos/${repo}/git/commits`, {
  message,
  tree: treeSha,
  author: {
    name: execSync('git config user.name', { encoding: 'utf8' }).trim(),
    email: execSync('git config user.email', { encoding: 'utf8' }).trim(),
    date: new Date().toISOString(),
  },
});

try {
  ghApi('POST', `repos/${repo}/git/refs`, { ref: 'refs/heads/main', sha: commit.sha });
  console.log(`Created branch main at ${commit.sha}`);
} catch (e) {
  ghApi('PATCH', `repos/${repo}/git/refs/heads/main`, { sha: commit.sha, force: true });
  console.log(`Updated branch main to ${commit.sha}`);
}

console.log(`Done: https://github.com/${repo}`);
