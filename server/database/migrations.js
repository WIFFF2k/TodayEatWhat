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
  // 为持续对抗补充攻击冷却字段
  const realmPlayerColumns = db.prepare('PRAGMA table_info(realm_players)').all();
  if (!realmPlayerColumns.some(column => column.name === 'gather_ready_at')) db.exec('ALTER TABLE realm_players ADD COLUMN gather_ready_at INTEGER NOT NULL DEFAULT 0');
  if (!realmPlayerColumns.some(column => column.name === 'attack_ready_at')) db.exec('ALTER TABLE realm_players ADD COLUMN attack_ready_at TEXT');
  // 为遗迹地块补充探索归属，让野外冒险有明确的一次性记录
  const realmTileColumns = db.prepare('PRAGMA table_info(realm_tiles)').all();
  if (!realmTileColumns.some(column => column.name === 'explored_by')) db.exec('ALTER TABLE realm_tiles ADD COLUMN explored_by TEXT REFERENCES users(name)');
  db.exec(`CREATE TABLE IF NOT EXISTS realm_action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL REFERENCES users(name),
    action TEXT NOT NULL,
    target_q INTEGER,
    target_r INTEGER,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  ); CREATE INDEX IF NOT EXISTS idx_realm_action_logs_actor ON realm_action_logs(actor, id DESC);`);
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
};
