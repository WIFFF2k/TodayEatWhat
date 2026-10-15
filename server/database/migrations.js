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
  const optionColumns = db.prepare('PRAGMA table_info(options)').all();
  if (!optionColumns.some(column => column.name === 'deleted_at')) {
    db.exec('ALTER TABLE options ADD COLUMN deleted_at TEXT');
  }
  const optionSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='options'").get()?.sql || '';
  if (!optionSql.includes("'good_meal'") || !optionSql.includes("'casual_out'") || !optionSql.includes("'takeout'") || !optionSql.includes("'pending'")) {
    // SQLite 不能直接修改 CHECK，重建表并把旧分类映射到新分类
    db.exec(`
      CREATE TABLE options_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('good_meal', 'casual_out', 'takeout', 'pending')),
        enabled INTEGER NOT NULL DEFAULT 1,
        added_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        deleted_at TEXT
      );
      INSERT INTO options_next(id,name,category,enabled,added_by,created_at,deleted_at)
        SELECT id,name,${categoryCase('category')},enabled,added_by,created_at,deleted_at
        FROM options;
      DROP TABLE options;
      ALTER TABLE options_next RENAME TO options;
    `);
  }
  db.exec(`
    UPDATE options SET category = ${categoryCase('category')} WHERE category IN (${legacyValues()});
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
};
