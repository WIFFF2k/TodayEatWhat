// 创建唯一数据库连接并按顺序完成初始化
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { dataDir } = require('../config/paths');
const createSchema = require('./schema');
const seed = require('./seed');
const migrate = require('./migrations');
const { bootstrapOptions } = require('../modules/options/bootstrap');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'eat-what.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec('BEGIN IMMEDIATE');
try {
  createSchema(db);
  seed(db);
  migrate(db);
  bootstrapOptions(db);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  db.close();
  throw error;
}
module.exports = db;
