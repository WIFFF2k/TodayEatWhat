// 查询和修改飞机大战独立失败结果池
const db = require('../../../database');
function list() {
  // 只返回未删除的失败结果
  return db.prepare('SELECT id,name,style_index AS styleIndex,enabled,added_by AS addedBy,created_at AS createdAt FROM game_failure_options WHERE deleted_at IS NULL ORDER BY id').all();
}
function get(id) { return db.prepare('SELECT * FROM game_failure_options WHERE id=? AND deleted_at IS NULL').get(id); }
function duplicate(name, id = 0) { return db.prepare('SELECT id FROM game_failure_options WHERE name=? AND id<>? AND deleted_at IS NULL').get(name, id); }
function insert(name, actor, styleIndex) { return db.prepare('INSERT INTO game_failure_options(name,style_index,added_by) VALUES(?,?,?)').run(name, styleIndex, actor); }
function usedStyles() { return db.prepare('SELECT style_index AS styleIndex FROM game_failure_options WHERE deleted_at IS NULL').all().map(item => item.styleIndex); }
function setEnabled(enabled, id) { return db.prepare('UPDATE game_failure_options SET enabled=? WHERE id=?').run(enabled, id); }
function rename(name, id) { return db.prepare('UPDATE game_failure_options SET name=? WHERE id=?').run(name, id); }
function remove(id) { return db.prepare("UPDATE game_failure_options SET deleted_at=datetime('now','localtime'),enabled=0 WHERE id=?").run(id); }
function enabled() { return db.prepare('SELECT id,name,enabled,added_by AS addedBy FROM game_failure_options WHERE enabled=1 AND deleted_at IS NULL ORDER BY id').all(); }
module.exports = { list, get, duplicate, insert, usedStyles, setEnabled, rename, remove, enabled };
