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
CREATE TABLE IF NOT EXISTS game_failure_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  style_index INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  deleted_at TEXT
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
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  participants TEXT NOT NULL DEFAULT '[]',
  photo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS realm_world (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seed INTEGER NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS realm_players (
  user_name TEXT PRIMARY KEY REFERENCES users(name),
  home_q INTEGER NOT NULL,
  home_r INTEGER NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0,
  phase INTEGER NOT NULL DEFAULT 0,
  cultivation_exp INTEGER NOT NULL DEFAULT 0,
  grain INTEGER NOT NULL DEFAULT 80,
  wood INTEGER NOT NULL DEFAULT 60,
  ore INTEGER NOT NULL DEFAULT 30,
  essence INTEGER NOT NULL DEFAULT 10,
  last_collected_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  shield_until TEXT,
  attack_ready_at TEXT,
  gather_ready_at INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS realm_tiles (
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  terrain TEXT NOT NULL,
  owner TEXT REFERENCES users(name),
  building TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  explored_by TEXT REFERENCES users(name),
  discovered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (q, r)
);
CREATE TABLE IF NOT EXISTS realm_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  q INTEGER,
  r INTEGER,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_realm_tiles_owner ON realm_tiles(owner);
CREATE INDEX IF NOT EXISTS idx_realm_events_active ON realm_events(starts_at, ends_at);
CREATE TABLE IF NOT EXISTS realm_event_participants (
  event_id INTEGER NOT NULL REFERENCES realm_events(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL REFERENCES users(name),
  participated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (event_id, user_name)
);
CREATE INDEX IF NOT EXISTS idx_realm_event_participants_user ON realm_event_participants(user_name, event_id DESC);
CREATE TABLE IF NOT EXISTS realm_action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL REFERENCES users(name),
  action TEXT NOT NULL,
  target_q INTEGER,
  target_r INTEGER,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_realm_action_logs_actor ON realm_action_logs(actor, id DESC);
CREATE TABLE IF NOT EXISTS realm_alliances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  leader TEXT NOT NULL REFERENCES users(name),
  grain INTEGER NOT NULL DEFAULT 0,
  wood INTEGER NOT NULL DEFAULT 0,
  ore INTEGER NOT NULL DEFAULT 0,
  essence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS realm_alliance_members (
  alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  user_name TEXT PRIMARY KEY REFERENCES users(name),
  role TEXT NOT NULL DEFAULT 'member',
  contribution INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_members_alliance ON realm_alliance_members(alliance_id, contribution DESC);
CREATE TABLE IF NOT EXISTS realm_alliance_projects (
  alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  project_key TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (alliance_id, project_key)
);
CREATE INDEX IF NOT EXISTS idx_spin_records_created ON spin_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poll_choices_poll ON poll_choices (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_ballots_poll ON poll_ballots (poll_id);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories (id DESC);
  `);
};
