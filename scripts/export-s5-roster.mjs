#!/usr/bin/env node
/**
 * 从 S5 百策拍卖 SQLite 导出 roster 到 data/s5-roster.json
 *
 * 用法：
 *   node scripts/export-s5-roster.mjs [auction.db路径]
 *
 * 默认路径：d:/开发类/baicai s5-Auction/server/auction.db
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const defaultDb = 'd:/开发类/baicai s5-Auction/server/auction.db';
const dbPath = process.argv[2] || defaultDb;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'data/s5-roster.json');

if (!existsSync(dbPath)) {
  console.error(`找不到数据库: ${dbPath}`);
  process.exit(1);
}

const py = `
import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1])
c.row_factory = sqlite3.Row
rows = [dict(r) for r in c.execute(
  "SELECT sort_order, identity, serial, name, pool_letter, start_price, buyout_price, funds, avatar "
  "FROM roster ORDER BY sort_order"
)]
print(json.dumps(rows, ensure_ascii=False))
`;

const result = spawnSync('python', ['-c', py, dbPath], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.stderr || 'Python 导出失败');
  process.exit(1);
}

const rows = JSON.parse(result.stdout);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8');

const players = rows.filter((r) => r.identity === 'player').length;
const captains = rows.filter((r) => r.identity === 'captain').length;
console.log(`已导出 ${rows.length} 条 -> ${outPath}（${players} 选手，${captains} 队长）`);
