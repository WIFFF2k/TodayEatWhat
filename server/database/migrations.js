// 升级旧数据库结构、迁移用餐分类并补齐不可变的操作记录
const { legacyCategoryMap } = require('../shared/categories');
function categoryCase(column) {
  // 把旧显示名和过渡显示名统一迁移为稳定分类 key
  const cases = Object.entries(legacyCategoryMap).map(([from, to]) => `WHEN '${from}' THEN '${to}'`).join(' ');
  return `CASE ${column} ${cases} ELSE ${column} END`;
}
function legacyValues() {
  // 生成旧分类值列表，只更新确实属于历史词汇的值
  return Object.keys(legacyCategoryMap).map(value => `'${value}'`).join(',');
}
module.exports = function migrate(db) {
  // 按实际字段和索引判断迁移，重复启动不重复添加日志
  // 为转盘结果与投票建立可追溯关联，保留已有投票
  const pollColumns = db.prepare('PRAGMA table_info(polls)').all();
  if (!pollColumns.some((column) => column.name === 'spin_id')) {
    db.exec('ALTER TABLE polls ADD COLUMN spin_id INTEGER REFERENCES spin_records(id)');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_spin ON polls(spin_id) WHERE spin_id IS NOT NULL');

  // 为固定候选项补充语义编号，旧投票保留原有名称快照
  const choiceColumns = db.prepare('PRAGMA table_info(poll_choices)').all();
  if (!choiceColumns.some(column => column.name === 'code')) {
    db.exec('ALTER TABLE poll_choices ADD COLUMN code TEXT');
  }

  // 迁移共享选项和操作留痕，旧选项的添加人及添加时间保持不变
  let optionColumns = db.prepare('PRAGMA table_info(options)').all();
  if (!optionColumns.some(column => column.name === 'deleted_at')) {
    db.exec('ALTER TABLE options ADD COLUMN deleted_at TEXT');
    optionColumns = db.prepare('PRAGMA table_info(options)').all();
  }
  if (!optionColumns.some(column => column.name === 'sort_order')) {
    db.exec('ALTER TABLE options ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
  const optionSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='options'").get()?.sql || '';
  if (!optionSql.includes("'good_meal'") || !optionSql.includes("'casual_out'") || !optionSql.includes("'takeout'") || !optionSql.includes("'pending'")) {
    // SQLite 不能直接修改 CHECK，重建表并把旧分类映射到新分类
    db.exec(`
      CREATE TABLE options_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('good_meal', 'casual_out', 'takeout', 'pending')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        added_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        deleted_at TEXT
      );
      INSERT INTO options_next(id,name,category,sort_order,enabled,added_by,created_at,deleted_at)
        SELECT id,name,${categoryCase('category')},sort_order,enabled,added_by,created_at,deleted_at
        FROM options;
      DROP TABLE options;
      ALTER TABLE options_next RENAME TO options;
    `);
  }
  db.exec(`
    UPDATE options SET category = ${categoryCase('category')} WHERE category IN (${legacyValues()});
    UPDATE options SET sort_order = id WHERE sort_order IS NULL OR sort_order = 0;
    UPDATE spin_records SET category = ${categoryCase('category')} WHERE category IN (${legacyValues()});
  `);

  // 旧日志表只能记录增删改重命名，重建后支持分类移动和分类变化字段
  const logTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='option_logs'").get();
  const logSql = logTable?.sql || '';
  const logColumns = db.prepare('PRAGMA table_info(option_logs)').all();
  const logNeedsRebuild = logSql && (!logSql.includes("'move'") ||
    !logColumns.some(column => column.name === 'old_category') ||
    !logColumns.some(column => column.name === 'new_category'));
  if (logNeedsRebuild) {
    db.exec(`
      DROP INDEX IF EXISTS idx_option_initial_log;
      ALTER TABLE option_logs RENAME TO option_logs_legacy;
      CREATE TABLE option_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        option_id INTEGER NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('add','rename','delete','move')),
        actor TEXT NOT NULL,
        category TEXT NOT NULL,
        old_category TEXT,
        new_category TEXT,
        old_name TEXT,
        new_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      INSERT INTO option_logs(id,option_id,action,actor,category,old_category,new_category,old_name,new_name,created_at)
        SELECT id,option_id,action,actor,
          ${categoryCase('category')},
          CASE WHEN action='add' THEN NULL ELSE
            ${categoryCase('category')}
          END,
          CASE WHEN action='delete' THEN NULL ELSE
            ${categoryCase('category')}
          END,
          old_name,new_name,created_at
        FROM option_logs_legacy;
      DROP TABLE option_logs_legacy;
    `);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS option_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('add','rename','delete','move')),
      actor TEXT NOT NULL,
      category TEXT NOT NULL,
      old_category TEXT,
      new_category TEXT,
      old_name TEXT,
      new_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_option_initial_log ON option_logs(option_id) WHERE action='add';
    UPDATE option_logs SET category = ${categoryCase('category')} WHERE category IN (${legacyValues()});
    UPDATE option_logs SET old_category = ${categoryCase('old_category')} WHERE old_category IN (${legacyValues()});
    UPDATE option_logs SET new_category = ${categoryCase('new_category')} WHERE new_category IN (${legacyValues()});
    INSERT INTO option_logs(option_id,action,actor,category,old_category,new_category,old_name,new_name,created_at)
      SELECT id,'add',added_by,category,NULL,category,NULL,name,created_at FROM options o
      WHERE NOT EXISTS (SELECT 1 FROM option_logs l WHERE l.option_id=o.id AND l.action='add');
  `);
  // 为独立失败结果池补齐稳定颜色槽位，旧数据按现有顺序分配
  const gamePoolColumns = db.prepare('PRAGMA table_info(game_failure_options)').all();
  const addedGameStyle = !gamePoolColumns.some(column => column.name === 'style_index');
  if (addedGameStyle) {
    db.exec('ALTER TABLE game_failure_options ADD COLUMN style_index INTEGER NOT NULL DEFAULT 0');
    const gamePoolRows = db.prepare('SELECT id FROM game_failure_options WHERE deleted_at IS NULL ORDER BY id').all();
    const updateGamePoolStyle = db.prepare('UPDATE game_failure_options SET style_index=? WHERE id=?');
    gamePoolRows.forEach((row, index) => updateGamePoolStyle.run(index % 10, row.id));
  }
  // 为新世界建立唯一初始种子，后续重置由迩灵邑业务接口负责
  db.prepare("INSERT OR IGNORE INTO realm_world(id,seed,epoch) VALUES(1,abs(random()) % 2147483647,1)").run();
  db.exec('UPDATE realm_world SET seed=abs(seed) % 2147483647 WHERE id=1');
  // 为持续赛季补充历史排行榜快照
  db.exec(`CREATE TABLE IF NOT EXISTS realm_season_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_number INTEGER NOT NULL UNIQUE,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    rankings TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );`);
  const seasonHistoryColumns = db.prepare('PRAGMA table_info(realm_season_history)').all();
  if (!seasonHistoryColumns.some(column => column.name === 'cultivation_rankings')) db.exec("ALTER TABLE realm_season_history ADD COLUMN cultivation_rankings TEXT NOT NULL DEFAULT '[]'");
  // 为持续对抗补充攻击冷却字段
  const realmPlayerColumns = db.prepare('PRAGMA table_info(realm_players)').all();
  if (!realmPlayerColumns.some(column => column.name === 'talent')) db.exec('ALTER TABLE realm_players ADD COLUMN talent TEXT');
  if (!realmPlayerColumns.some(column => column.name === 'technique')) db.exec('ALTER TABLE realm_players ADD COLUMN technique TEXT');
  if (!realmPlayerColumns.some(column => column.name === 'technique_level')) db.exec('ALTER TABLE realm_players ADD COLUMN technique_level INTEGER NOT NULL DEFAULT 0');
  if (!realmPlayerColumns.some(column => column.name === 'gather_ready_at')) db.exec('ALTER TABLE realm_players ADD COLUMN gather_ready_at INTEGER NOT NULL DEFAULT 0');
  if (!realmPlayerColumns.some(column => column.name === 'attack_ready_at')) db.exec('ALTER TABLE realm_players ADD COLUMN attack_ready_at TEXT');
  db.exec('UPDATE realm_players SET gather_ready_at=0 WHERE gather_ready_at IS NULL');
  // 为世界首领活跃场次查询补齐时间窗口索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_realm_world_bosses_window ON realm_world_bosses(starts_at, ends_at, id DESC)');
  // 为局域网多人页面补充轻量在线心跳
  db.exec(`CREATE TABLE IF NOT EXISTS realm_presence (
    user_name TEXT PRIMARY KEY REFERENCES users(name) ON DELETE CASCADE,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  ); CREATE INDEX IF NOT EXISTS idx_realm_presence_last_seen ON realm_presence(last_seen_at DESC);`);
  const realmTileColumns = db.prepare('PRAGMA table_info(realm_tiles)').all();
  if (!realmTileColumns.some(column => column.name === 'specialization')) db.exec('ALTER TABLE realm_tiles ADD COLUMN specialization TEXT');
  if (!realmTileColumns.some(column => column.name === 'skill_ready_at')) db.exec('ALTER TABLE realm_tiles ADD COLUMN skill_ready_at INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE realm_tiles SET skill_ready_at=0 WHERE skill_ready_at IS NULL');
  // 为遗迹地块补充多人探索记录，让每位玩家都能各自探索一次
  db.exec(`CREATE TABLE IF NOT EXISTS realm_tile_explorers (
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    user_name TEXT NOT NULL REFERENCES users(name),
    explored_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (q, r, user_name),
    FOREIGN KEY (q, r) REFERENCES realm_tiles(q, r) ON DELETE CASCADE
  ); CREATE INDEX IF NOT EXISTS idx_realm_tile_explorers_user ON realm_tile_explorers(user_name, explored_at DESC);`);
  db.exec(`CREATE TABLE IF NOT EXISTS realm_action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL REFERENCES users(name),
    action TEXT NOT NULL,
    target_q INTEGER,
    target_r INTEGER,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  ); CREATE INDEX IF NOT EXISTS idx_realm_action_logs_actor ON realm_action_logs(actor, id DESC); CREATE INDEX IF NOT EXISTS idx_realm_action_logs_daily ON realm_action_logs(actor, action, created_at);`);
  // 为玩家攻防补充可追溯战报
  db.exec(`CREATE TABLE IF NOT EXISTS realm_battle_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker TEXT NOT NULL REFERENCES users(name),
    defender TEXT NOT NULL REFERENCES users(name),
    target_q INTEGER NOT NULL,
    target_r INTEGER NOT NULL,
    success INTEGER NOT NULL CHECK (success IN (0,1)),
    plunder TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  ); CREATE INDEX IF NOT EXISTS idx_realm_battle_reports_players ON realm_battle_reports(attacker, defender, id DESC); CREATE INDEX IF NOT EXISTS idx_realm_battle_reports_defender ON realm_battle_reports(defender, id DESC); CREATE INDEX IF NOT EXISTS idx_realm_battle_reports_defense_result ON realm_battle_reports(defender, success, id DESC);`);
  const battleReportColumns = db.prepare('PRAGMA table_info(realm_battle_reports)').all();
  if (!battleReportColumns.some(column => column.name === 'war_point')) {
    db.exec('ALTER TABLE realm_battle_reports ADD COLUMN war_point INTEGER NOT NULL DEFAULT 0');
  }
  // 为每日悬赏补充按天领取凭证
  db.exec(`CREATE TABLE IF NOT EXISTS realm_daily_quest_claims (
    user_name TEXT NOT NULL REFERENCES users(name),
    quest_date TEXT NOT NULL,
    quest_key TEXT NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (user_name, quest_date, quest_key)
  ); CREATE INDEX IF NOT EXISTS idx_realm_daily_quest_claims_user ON realm_daily_quest_claims(user_name, quest_date DESC);`);
  // 为修士功勋补充永久一次性领取凭证
  db.exec(`CREATE TABLE IF NOT EXISTS realm_achievement_claims (
    user_name TEXT NOT NULL REFERENCES users(name),
    achievement_key TEXT NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (user_name, achievement_key)
  ); CREATE INDEX IF NOT EXISTS idx_realm_achievement_claims_user ON realm_achievement_claims(user_name);`);
  // 为玩家间资源交易补充托管订单
  db.exec(`CREATE TABLE IF NOT EXISTS realm_trade_orders (
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
    CHECK (offer_resource <> want_resource)
  ); CREATE INDEX IF NOT EXISTS idx_realm_trade_orders_open ON realm_trade_orders(status, created_at DESC);`);
  // 为交易托管订单补充 24 小时有效期，避免资源无限期锁定
  const tradeColumns = db.prepare('PRAGMA table_info(realm_trade_orders)').all();
  if (!tradeColumns.some(column => column.name === 'expires_at')) {
    db.exec("ALTER TABLE realm_trade_orders ADD COLUMN expires_at TEXT");
    db.exec("UPDATE realm_trade_orders SET expires_at=datetime(created_at,'+24 hours') WHERE expires_at IS NULL");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_realm_trade_orders_expiry ON realm_trade_orders(status, expires_at)');
  // 为限时事件补充每位玩家的一次性参与记录
  db.exec(`CREATE TABLE IF NOT EXISTS realm_event_participants (
    event_id INTEGER NOT NULL REFERENCES realm_events(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL REFERENCES users(name),
    participated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (event_id, user_name)
  ); CREATE INDEX IF NOT EXISTS idx_realm_event_participants_user ON realm_event_participants(user_name, event_id DESC);`);
  // 为多人协作补充联盟与联盟仓库
  db.exec(`CREATE TABLE IF NOT EXISTS realm_alliances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    leader TEXT NOT NULL REFERENCES users(name),
    grain INTEGER NOT NULL DEFAULT 0,
    wood INTEGER NOT NULL DEFAULT 0,
    ore INTEGER NOT NULL DEFAULT 0,
    essence INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  ); CREATE TABLE IF NOT EXISTS realm_alliance_members (
    alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
    user_name TEXT PRIMARY KEY REFERENCES users(name),
    role TEXT NOT NULL DEFAULT 'member',
    contribution INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  ); CREATE INDEX IF NOT EXISTS idx_realm_alliance_members_alliance ON realm_alliance_members(alliance_id, contribution DESC);`);
  // 为联盟公共工程补充进度表
  db.exec(`CREATE TABLE IF NOT EXISTS realm_alliance_projects (
    alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
    project_key TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (alliance_id, project_key)
  );`);
  // 为联盟公共工程补充成员贡献明细
  db.exec(`CREATE TABLE IF NOT EXISTS realm_alliance_project_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL REFERENCES users(name),
    project_key TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('personal','warehouse')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  ); CREATE INDEX IF NOT EXISTS idx_realm_alliance_project_contributions_rank ON realm_alliance_project_contributions(alliance_id, project_key, amount DESC);`);
  // 为联盟外交补充盟约与停战申请
  db.exec(`CREATE TABLE IF NOT EXISTS realm_alliance_relations (
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
  ); CREATE INDEX IF NOT EXISTS idx_realm_alliance_relations_target ON realm_alliance_relations(alliance_b_id, status);`);
  // 为联盟外交补充限时战争与积分记录
  db.exec(`CREATE TABLE IF NOT EXISTS realm_alliance_wars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
    defender_alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
    attacker_score INTEGER NOT NULL DEFAULT 0,
    defender_score INTEGER NOT NULL DEFAULT 0,
    starts_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ends_at TEXT NOT NULL,
    CHECK (attacker_alliance_id <> defender_alliance_id)
  ); CREATE INDEX IF NOT EXISTS idx_realm_alliance_wars_active ON realm_alliance_wars(ends_at);`);
  // 为已存在数据库按字段缺失情况补充战争结算字段
  const warColumns = db.prepare('PRAGMA table_info(realm_alliance_wars)').all();
  if (!warColumns.some(column => column.name === 'settled_at')) db.exec('ALTER TABLE realm_alliance_wars ADD COLUMN settled_at TEXT');
  if (!warColumns.some(column => column.name === 'winner_alliance_id')) db.exec('ALTER TABLE realm_alliance_wars ADD COLUMN winner_alliance_id INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_realm_alliance_wars_pair ON realm_alliance_wars(attacker_alliance_id, defender_alliance_id, ends_at); CREATE INDEX IF NOT EXISTS idx_realm_alliance_wars_reverse_pair ON realm_alliance_wars(defender_alliance_id, attacker_alliance_id, ends_at)');
  // 为战争个人贡献补充参战记录
  db.exec(`CREATE TABLE IF NOT EXISTS realm_alliance_war_participants (
    war_id INTEGER NOT NULL REFERENCES realm_alliance_wars(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL REFERENCES users(name),
    alliance_id INTEGER NOT NULL REFERENCES realm_alliances(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (war_id, user_name)
  ); CREATE INDEX IF NOT EXISTS idx_realm_alliance_war_participants_rank ON realm_alliance_war_participants(war_id, alliance_id, points DESC); CREATE INDEX IF NOT EXISTS idx_realm_alliance_war_participants_rank_user ON realm_alliance_war_participants(war_id, alliance_id, points DESC, user_name);`);
  // 为限时世界首领补充共享血量与玩家伤害记录
  db.exec(`CREATE TABLE IF NOT EXISTS realm_world_bosses (
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
  ); CREATE INDEX IF NOT EXISTS idx_realm_world_bosses_active ON realm_world_bosses(ends_at, defeated_at);
  CREATE TABLE IF NOT EXISTS realm_world_boss_participants (
    boss_id INTEGER NOT NULL REFERENCES realm_world_bosses(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL REFERENCES users(name),
    damage INTEGER NOT NULL DEFAULT 0,
    attacks INTEGER NOT NULL DEFAULT 0,
    last_attack_at INTEGER NOT NULL DEFAULT 0,
    rewarded INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (boss_id, user_name)
  ); CREATE INDEX IF NOT EXISTS idx_realm_world_boss_participants_rank ON realm_world_boss_participants(boss_id, damage DESC); CREATE INDEX IF NOT EXISTS idx_realm_world_boss_participants_rank_user ON realm_world_boss_participants(boss_id, damage DESC, user_name);`);
  const worldBossParticipantColumns = db.prepare('PRAGMA table_info(realm_world_boss_participants)').all();
  if (!worldBossParticipantColumns.some(column => column.name === 'alliance_name')) db.exec('ALTER TABLE realm_world_boss_participants ADD COLUMN alliance_name TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_realm_world_boss_participants_alliance ON realm_world_boss_participants(boss_id, alliance_name, damage DESC)');
  // 为世界首领联盟奖励补充可追溯的仓库发放记录
  db.exec(`CREATE TABLE IF NOT EXISTS realm_world_boss_alliance_rewards (
    boss_id INTEGER NOT NULL REFERENCES realm_world_bosses(id) ON DELETE CASCADE,
    alliance_name TEXT NOT NULL,
    rank INTEGER NOT NULL,
    grain INTEGER NOT NULL DEFAULT 0,
    wood INTEGER NOT NULL DEFAULT 0,
    ore INTEGER NOT NULL DEFAULT 0,
    essence INTEGER NOT NULL DEFAULT 0,
    delivered INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (boss_id, alliance_name)
  ); CREATE INDEX IF NOT EXISTS idx_realm_world_boss_alliance_rewards_pending ON realm_world_boss_alliance_rewards(alliance_name, delivered, boss_id);`);
  const worldBossColumns = db.prepare('PRAGMA table_info(realm_world_bosses)').all();
  if (!worldBossColumns.some(column => column.name === 'kind')) db.exec("ALTER TABLE realm_world_bosses ADD COLUMN kind TEXT NOT NULL DEFAULT 'beast'");
  // 为迩灵邑突破材料统计补充用户索引，避免总览查询随历史记录增长退化为全表扫描
  db.exec('CREATE INDEX IF NOT EXISTS idx_spin_records_user ON spin_records(user_name); CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_name)');
};
