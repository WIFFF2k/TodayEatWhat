// 查询现存选项与选项操作日志
const db = require('../../../database');
const { timestamp } = require('../../../shared/time');
function options() {
  // 列出共享选项与添加记录
  return db.prepare('SELECT id, name, category, enabled, added_by AS addedBy, created_at AS createdAt FROM options WHERE deleted_at IS NULL ORDER BY id').all()
    .map(item => ({ ...item, enabled: Boolean(item.enabled), createdAt: timestamp(item.createdAt) }));
}

function getOption(id) {
  // 查询指定现存选项
  return db.prepare('SELECT * FROM options WHERE id=? AND deleted_at IS NULL').get(id);
}

function findDuplicate(name, category, id) {
  // 按分类查询同名现存选项
  return db.prepare('SELECT id FROM options WHERE name=? AND category=? AND id<>? AND deleted_at IS NULL').get(name, category, id);
}

function insertLog(item, action, actor, oldName, newName, oldCategory = null, newCategory = item.category) {
  // 写入不可变的操作快照
  return db.prepare('INSERT INTO option_logs(option_id,action,actor,category,old_category,new_category,old_name,new_name) VALUES(?,?,?,?,?,?,?,?)').run(item.id, action, actor, newCategory ?? item.category, oldCategory, newCategory, oldName, newName);
}

function readLogs(before, size) {
  // 按游标读取一页及下一页标志所需记录
  return db.prepare('SELECT id,option_id AS optionId,action,actor,category,old_category AS oldCategory,new_category AS newCategory,old_name AS oldName,new_name AS newName,created_at AS createdAt FROM option_logs WHERE id<? ORDER BY id DESC LIMIT ?').all(before, size + 1);
}

function insertOption(name, category, actor) {
  // 写入新增选项与添加人
  return db.prepare('INSERT INTO options(name,category,added_by) VALUES(?,?,?)').run(name, category, actor);
}

function setEnabled(enabled, id) {
  // 更新全局启用状态
  return db.prepare('UPDATE options SET enabled=? WHERE id=?').run(enabled, id);
}

function renameOption(name, id) {
  // 更新现存名称
  return db.prepare('UPDATE options SET name=? WHERE id=?').run(name, id);
}

function moveOption(category, id) {
  // 更新选项所属分类
  return db.prepare('UPDATE options SET category=? WHERE id=?').run(category, id);
}

function softDelete(id) {
  // 标记删除并停用选项
  return db.prepare("UPDATE options SET deleted_at=datetime('now','localtime'),enabled=0 WHERE id=?").run(id);
}

function enabledOptions(category) {
  // 抽签与新投票共用未删除且启用的候选定义
  return db.prepare('SELECT id,name,category FROM options WHERE category=? AND enabled=1 AND deleted_at IS NULL ORDER BY id').all(category);
}

module.exports = { options, getOption, findDuplicate, insertLog, readLogs, insertOption, setEnabled, renameOption, moveOption, softDelete, enabledOptions };
