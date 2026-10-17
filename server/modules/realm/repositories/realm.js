// 读写迩灵邑世界、玩家、六边形地块和事件数据
const db = require('../../../database');

function world() {
  // 读取唯一世界状态
  return db.prepare('SELECT id,seed,epoch,created_at AS createdAt FROM realm_world WHERE id=1').get();
}

function player(name) {
  // 读取玩家的领地与修炼状态
  return db.prepare('SELECT user_name AS userName,home_q AS homeQ,home_r AS homeR,stage,phase,cultivation_exp AS cultivationExp,grain,wood,ore,essence,last_collected_at AS lastCollectedAt,shield_until AS shieldUntil FROM realm_players WHERE user_name=?').get(name);
}

function savePlayer(data) {
  // 保存玩家资源与修炼状态
  db.prepare(`UPDATE realm_players SET stage=?,phase=?,cultivation_exp=?,grain=?,wood=?,ore=?,essence=?,last_collected_at=?,shield_until=?,updated_at=datetime('now','localtime') WHERE user_name=?`).run(data.stage, data.phase, data.cultivationExp, data.grain, data.wood, data.ore, data.essence, data.lastCollectedAt, data.shieldUntil, data.userName);
}

function insertPlayer(data) {
  // 创建玩家并写入出生点
  db.prepare('INSERT INTO realm_players(user_name,home_q,home_r,shield_until) VALUES(?,?,?,datetime(\'now\',\'localtime\',\'+30 minutes\'))').run(data.userName, data.homeQ, data.homeR);
}

function tile(q, r) {
  // 读取一个六边形地块
  return db.prepare('SELECT q,r,terrain,owner,building,level,discovered_at AS discoveredAt FROM realm_tiles WHERE q=? AND r=?').get(q, r);
}

function insertTile(data) {
  // 写入首次生成的地块
  db.prepare('INSERT OR IGNORE INTO realm_tiles(q,r,terrain,owner,building,level) VALUES(?,?,?,?,?,?)').run(data.q, data.r, data.terrain, data.owner || null, data.building || null, data.level || 0);
  return tile(data.q, data.r);
}

function updateTile(data) {
  // 更新地块归属、建筑和等级
  db.prepare('UPDATE realm_tiles SET owner=?,building=?,level=? WHERE q=? AND r=?').run(data.owner || null, data.building || null, data.level || 0, data.q, data.r);
}

function tiles(minQ, maxQ, minR, maxR) {
  // 按视口范围读取已生成地块
  return db.prepare('SELECT q,r,terrain,owner,building,level,discovered_at AS discoveredAt FROM realm_tiles WHERE q BETWEEN ? AND ? AND r BETWEEN ? AND ? ORDER BY r,q').all(minQ, maxQ, minR, maxR);
}

function activeEvents() {
  // 读取当前生效的特殊事件
  return db.prepare("SELECT id,kind,title,description,q,r,payload,starts_at AS startsAt,ends_at AS endsAt FROM realm_events WHERE starts_at<=datetime('now','localtime') AND ends_at>datetime('now','localtime') ORDER BY id DESC").all().map(item => ({ ...item, payload: JSON.parse(item.payload) }));
}

function insertEvent(data) {
  // 创建世界特殊事件
  return db.prepare('INSERT INTO realm_events(kind,title,description,q,r,starts_at,ends_at,payload) VALUES(?,?,?,?,?,?,?,?)').run(data.kind, data.title, data.description, data.q ?? null, data.r ?? null, data.startsAt, data.endsAt, JSON.stringify(data.payload || {}));
}

module.exports = { world, player, savePlayer, insertPlayer, tile, insertTile, updateTile, tiles, activeEvents, insertEvent };
