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
CREATE TABLE IF NOT EXISTS realm_season_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_number INTEGER NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  rankings TEXT NOT NULL DEFAULT '[]',
  cultivation_rankings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS realm_players (
  user_name TEXT PRIMARY KEY REFERENCES users(name),
  home_q INTEGER NOT NULL,
  home_r INTEGER NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0,
  phase INTEGER NOT NULL DEFAULT 0,
  talent TEXT,
  technique TEXT,
  technique_level INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS realm_presence (
  user_name TEXT PRIMARY KEY REFERENCES users(name) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_realm_presence_last_seen ON realm_presence(last_seen_at DESC);
CREATE TABLE IF NOT EXISTS realm_tiles (
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  terrain TEXT NOT NULL,
  owner TEXT REFERENCES users(name),
  building TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  specialization TEXT,
  skill_ready_at INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS realm_tile_explorers (
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  user_name TEXT NOT NULL REFERENCES users(name),
  explored_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (q, r, user_name),
  FOREIGN KEY (q, r) REFERENCES realm_tiles(q, r) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_realm_tile_explorers_user ON realm_tile_explorers(user_name, explored_at DESC);
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
CREATE TABLE IF NOT EXISTS realm_battle_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker TEXT NOT NULL REFERENCES users(name),
  defender TEXT NOT NULL REFERENCES users(name),
  target_q INTEGER NOT NULL,
  target_r INTEGER NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0,1)),
  plunder TEXT NOT NULL DEFAULT '{}',
  war_point INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_realm_battle_reports_players ON realm_battle_reports(attacker, defender, id DESC);
CREATE INDEX IF NOT EXISTS idx_realm_battle_reports_defender ON realm_battle_reports(defender, id DESC);
CREATE INDEX IF NOT EXISTS idx_realm_battle_reports_defense_result ON realm_battle_reports(defender, success, id DESC);
CREATE TABLE IF NOT EXISTS realm_daily_quest_claims (
  user_name TEXT NOT NULL REFERENCES users(name),
  quest_date TEXT NOT NULL,
  quest_key TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (user_name, quest_date, quest_key)
);
CREATE INDEX IF NOT EXISTS idx_realm_daily_quest_claims_user ON realm_daily_quest_claims(user_name, quest_date DESC);
CREATE TABLE IF NOT EXISTS realm_achievement_claims (
  user_name TEXT NOT NULL REFERENCES users(name),
  achievement_key TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (user_name, achievement_key)
);
CREATE INDEX IF NOT EXISTS idx_realm_achievement_claims_user ON realm_achievement_claims(user_name);
CREATE TABLE IF NOT EXISTS realm_trade_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller TEXT NOT NULL REFERENCES users(name),
  offer_resource TEXT NOT NULL CHECK (offer_resource IN ('grain','wood','ore','essence')),
  offer_amount INTEGER NOT NULL CHECK (offer_amount > 0),
  want_resource TEXT NOT NULL CHECK (want_resource IN ('grain','wood','ore','essence')),
  want_amount INTEGER NOT NULL CHECK (want_amount > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled')),
  filled_by TEXT REFERENCES users(name),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  filled_at TEXT,
  expires_at TEXT,
  CHECK (offer_resource <> want_resource)
);
CREATE INDEX IF NOT EXISTS idx_realm_trade_orders_open ON realm_trade_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realm_trade_orders_expiry ON realm_trade_orders(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_realm_action_logs_actor ON realm_action_logs(actor, id DESC);
CREATE INDEX IF NOT EXISTS idx_realm_action_logs_daily ON realm_action_logs(actor, action, created_at);
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
CREATE TABLE IF NOT EXISTS realm_alliance_project_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL REFERENCES users(name),
  project_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('personal','warehouse')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_project_contributions_rank ON realm_alliance_project_contributions(alliance_id, project_key, amount DESC);
CREATE TABLE IF NOT EXISTS realm_alliance_relations (
  alliance_a_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  alliance_b_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ally', 'truce')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'declined', 'ended')),
  proposer_alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  responded_at TEXT,
  PRIMARY KEY (alliance_a_id, alliance_b_id),
  CHECK (alliance_a_id < alliance_b_id),
  CHECK (proposer_alliance_id = alliance_a_id OR proposer_alliance_id = alliance_b_id)
);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_relations_target ON realm_alliance_relations(alliance_b_id, status);
CREATE TABLE IF NOT EXISTS realm_alliance_wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  defender_alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  attacker_score INTEGER NOT NULL DEFAULT 0,
  defender_score INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ends_at TEXT NOT NULL,
  settled_at TEXT,
  winner_alliance_id INTEGER,
  CHECK (attacker_alliance_id <> defender_alliance_id)
);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_wars_active ON realm_alliance_wars(ends_at);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_wars_pair ON realm_alliance_wars(attacker_alliance_id, defender_alliance_id, ends_at);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_wars_reverse_pair ON realm_alliance_wars(defender_alliance_id, attacker_alliance_id, ends_at);
CREATE TABLE IF NOT EXISTS realm_alliance_war_participants (
  war_id INTEGER NOT NULL REFERENCES realm_alliance_wars(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL REFERENCES users(name),
  alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (war_id, user_name)
);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_war_participants_rank ON realm_alliance_war_participants(war_id, alliance_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_realm_alliance_war_participants_rank_user ON realm_alliance_war_participants(war_id, alliance_id, points DESC, user_name);
CREATE TABLE IF NOT EXISTS realm_world_bosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle INTEGER NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'beast',
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  max_hp INTEGER NOT NULL,
  current_hp INTEGER NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  defeated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_realm_world_bosses_active ON realm_world_bosses(ends_at, defeated_at);
CREATE INDEX IF NOT EXISTS idx_realm_world_bosses_window ON realm_world_bosses(starts_at, ends_at, id DESC);
CREATE TABLE IF NOT EXISTS realm_world_boss_participants (
  boss_id INTEGER NOT NULL REFERENCES realm_world_bosses(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL REFERENCES users(name),
  alliance_name TEXT,
  damage INTEGER NOT NULL DEFAULT 0,
  attacks INTEGER NOT NULL DEFAULT 0,
  last_attack_at INTEGER NOT NULL DEFAULT 0,
  rewarded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (boss_id, user_name)
);
CREATE INDEX IF NOT EXISTS idx_realm_world_boss_participants_rank ON realm_world_boss_participants(boss_id, damage DESC);
CREATE INDEX IF NOT EXISTS idx_realm_world_boss_participants_rank_user ON realm_world_boss_participants(boss_id, damage DESC, user_name);
CREATE INDEX IF NOT EXISTS idx_realm_world_boss_participants_alliance ON realm_world_boss_participants(boss_id, alliance_name, damage DESC);
CREATE TABLE IF NOT EXISTS realm_world_boss_alliance_rewards (
  boss_id INTEGER NOT NULL REFERENCES realm_world_bosses(id) ON DELETE CASCADE,
  alliance_name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  grain INTEGER NOT NULL DEFAULT 0,
  wood INTEGER NOT NULL DEFAULT 0,
  ore INTEGER NOT NULL DEFAULT 0,
  essence INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (boss_id, alliance_name)
);
CREATE INDEX IF NOT EXISTS idx_realm_world_boss_alliance_rewards_pending ON realm_world_boss_alliance_rewards(alliance_name, delivered, boss_id);
CREATE INDEX IF NOT EXISTS idx_spin_records_created ON spin_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spin_records_user ON spin_records (user_name);
CREATE INDEX IF NOT EXISTS idx_poll_choices_poll ON poll_choices (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_ballots_poll ON poll_ballots (poll_id);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories (id DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories (user_name);
  `);
};
