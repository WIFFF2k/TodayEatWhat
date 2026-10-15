// 升级旧数据库结构并补齐不可变的添加记录
module.exports = function migrate(db) {
  // 按实际字段和索引判断迁移，重复启动不重复添加日志
  // 为转盘结果与投票建立可追溯关联，保留已有投票
  const pollColumns = db.prepare('PRAGMA table_info(polls)').all();
  if (!pollColumns.some((column) => column.name === 'spin_id')) {
    db.exec('ALTER TABLE polls ADD COLUMN spin_id INTEGER REFERENCES spin_records(id)');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_spin ON polls(spin_id) WHERE spin_id IS NOT NULL');

  // 迁移共享选项和操作留痕，旧选项的添加人及添加时间保持不变
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
};
