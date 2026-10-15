// 创建基础表及索引，保留已存在的数据
module.exports = function createSchema(db) {
  // 建表操作重复执行不覆盖已有表
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('good_meal', 'casual_out', 'takeout', 'pending')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS spin_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT NOT NULL,
  category TEXT NOT NULL,
  option_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  creator TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('single', 'multiple')),
  minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS poll_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  name TEXT NOT NULL,
  UNIQUE (poll_id, name)
);
CREATE TABLE IF NOT EXISTS poll_ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  user_name TEXT NOT NULL,
  choice_id INTEGER NOT NULL REFERENCES poll_choices(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (poll_id, user_name, choice_id)
);
CREATE INDEX IF NOT EXISTS idx_spin_records_created ON spin_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poll_choices_poll ON poll_choices (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_ballots_poll ON poll_ballots (poll_id);
  `);
};
