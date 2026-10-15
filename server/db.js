// 建立并初始化今天吃啥的 SQLite 数据库
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'eat-what.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('外卖', '出去吃')),
  enabled INTEGER NOT NULL DEFAULT 1,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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

const init = () => {
  // 在首次启动时补充白名单与初始选项，不重置已有配置
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)');
  const users = [
    '张圣楚', '刘心怡', '杨淑慧', '蔡进', '肖阳', '李民顺', '方杭健', '舒海润', '马烜',
    '居帅', '卜梦恬', '王普瑞', '徐箫炯', '白芸惠', '王岩', '韩铖浩', '宋恩泽',
    '李晨昊', '付俊桥', '肖迪升', '尚佳蕊', '刘宇轩', '原笑哲', '周豪', '常新雨'
  ];
  for (const name of users) insertUser.run(name);

  const isEmpty = db.prepare('SELECT COUNT(*) AS count FROM options').get().count === 0;
  if (isEmpty) {
    const insertOption = db.prepare('INSERT INTO options (name, category, added_by) VALUES (?, ?, ?)');
    for (const name of ['大米先生', '紫燕百味鸡', '东北饭盒', '赣湘记', '马香纯兰州拉面（金地太阳城店）', '大碗东北饭盒（京东）']) {
      insertOption.run(name, '外卖', '张圣楚');
    }
    for (const name of ['南昌水煮', '鲁磨路重庆冒菜（串串）', '鲁磨路东北饺子', '西区五号王氏现捞', '荣记广式烧腊', '大米先生']) {
      insertOption.run(name, '出去吃', '张圣楚');
    }
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('pollMode', 'single');
  insertSetting.run('pollMinutes', '60');
};
db.exec('BEGIN IMMEDIATE');
try {
  init();
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
// 为转盘结果与投票建立可追溯关联，保留已有投票
const pollColumns = db.prepare('PRAGMA table_info(polls)').all();
if (!pollColumns.some((column) => column.name === 'spin_id')) {
  db.exec('ALTER TABLE polls ADD COLUMN spin_id INTEGER REFERENCES spin_records(id)');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_spin ON polls(spin_id) WHERE spin_id IS NOT NULL');

// 迁移共享选项和操作留痕，旧选项的添加人及添加时间保持不变
db.exec('BEGIN IMMEDIATE');
try {
  const columns = db.prepare('PRAGMA table_info(options)').all();
  if (!columns.some(column => column.name === 'deleted_at')) {
    db.exec('ALTER TABLE options ADD COLUMN deleted_at TEXT');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS option_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('add','rename','delete')),
      actor TEXT NOT NULL,
      category TEXT NOT NULL,
      old_name TEXT,
      new_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_option_initial_log ON option_logs(option_id) WHERE action='add';
    INSERT INTO option_logs(option_id,action,actor,category,new_name,created_at)
      SELECT id,'add',added_by,category,name,created_at FROM options o
      WHERE NOT EXISTS (SELECT 1 FROM option_logs l WHERE l.option_id=o.id AND l.action='add');
  `);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

module.exports = db;
