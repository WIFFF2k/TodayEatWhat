// 编排迩灵邑的地图生成、资源、领地、建筑和修炼规则
const { fail } = require('../../../shared/errors');
const transaction = require('../../../database/transaction');
const repo = require('../repositories/realm');
const db = require('../../../database');
const { activity } = require('./activityProvider');

const STAGES = ['炼体','练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫','真仙','金仙','太乙','大罗','道祖'];
const PHASES = ['初期','中期','后期','半步圆满','圆满'];
const BUILDINGS = { granary: { name: '灵谷仓', cost: [30, 20, 0, 0], gain: 4 }, lumber: { name: '青木坊', cost: [20, 30, 0, 0], gain: 4 }, mine: { name: '玄铁矿', cost: [20, 0, 25, 0], gain: 3 }, altar: { name: '聚灵坛', cost: [30, 0, 0, 12], gain: 2 } };

function hash(q, r, seed) {
  // 用世界种子为每个坐标生成稳定地形
  let value = Math.imul(q + 374761393, 668265263) ^ Math.imul(r + 1274126177, 2246822519) ^ seed;
  value = Math.imul(value ^ value >>> 13, 1274126177); return (value ^ value >>> 16) >>> 0;
}

function terrain(q, r, seed) {
  // 根据稳定随机值选择地形与资源倾向
  const roll = hash(q, r, seed) % 100; return roll < 8 ? '灵泉' : roll < 20 ? '矿脉' : roll < 35 ? '古林' : roll < 43 ? '遗迹' : '平原';
}

function distance(aQ, aR, bQ, bR) {
  // 计算轴向六边形距离
  return (Math.abs(aQ - bQ) + Math.abs(aQ + aR - bQ - bR) + Math.abs(aR - bR)) / 2;
}

function localSqlTime(date) {
  // 将时间格式化为数据库使用的上海本地时间文本
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {}); return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function ensurePlayer(userName) {
  // 为首次进入的玩家分配互不重叠的出生点
  let current = repo.player(userName); if (current) return current;
  const index = Math.abs([...userName].reduce((sum, char) => sum + char.codePointAt(0), 0)); let homeQ = index % 9 - 4; let homeR = Math.floor(index / 9) % 9 - 4; while (repo.tile(homeQ, homeR)?.owner) { homeQ += 2; homeR -= 1; }
  transaction(() => { repo.insertPlayer({ userName, homeQ, homeR }); repo.insertTile({ q: homeQ, r: homeR, terrain: '平原', owner: userName, building: 'town', level: 1 }); });
  return repo.player(userName);
}

function ensureTiles(centerQ, centerR, radius) {
  // 只生成当前视口范围内尚不存在的地块
  const world = repo.world(); for (let q = centerQ - radius; q <= centerQ + radius; q += 1) for (let r = centerR - radius; r <= centerR + radius; r += 1) if (distance(q, r, centerQ, centerR) <= radius && !repo.tile(q, r)) repo.insertTile({ q, r, terrain: terrain(q, r, world.seed) });
}

function collect(userName) {
  // 结算离线自动产出与点击采集奖励
  const data = ensurePlayer(userName); const now = Date.now(); const last = new Date(data.lastCollectedAt.replace(' ', 'T') + '+08:00').getTime(); const elapsed = Math.max(0, Math.min(86400, (now - last) / 1000));
  const owned = repo.tiles(data.homeQ - 20, data.homeQ + 20, data.homeR - 20, data.homeR + 20).filter(item => item.owner === userName); const buildings = owned.reduce((sum, item) => sum + (BUILDINGS[item.building]?.gain || 0) * Math.max(1, item.level), 0); const pulse = Math.floor(elapsed / 60 * Math.max(1, buildings));
  data.grain += pulse + 3; data.wood += Math.floor(pulse * .7) + 2; data.ore += Math.floor(pulse * .35); data.essence += Math.floor(pulse * .12); data.cultivationExp += Math.floor(elapsed / 120); data.lastCollectedAt = new Date(now).toISOString().slice(0, 19).replace('T', ' '); transaction(() => repo.savePlayer(data)); return repo.player(userName);
}

function overview(userName, q = 0, r = 0) {
  // 返回当前玩家状态、视口地块和活跃事件
  const data = collect(userName); const centerQ = Number.isInteger(Number(q)) ? Number(q) : data.homeQ; const centerR = Number.isInteger(Number(r)) ? Number(r) : data.homeR; ensureTiles(centerQ, centerR, 4); let events = repo.activeEvents(); if (!events.length) { const now = new Date(); const ends = new Date(now.getTime() + 30 * 60 * 1000); repo.insertEvent({ kind: 'world', title: '灵潮初现', description: '天地灵气在附近汇聚，所有邑城的主动修炼经验暂时提高', startsAt: localSqlTime(now), endsAt: localSqlTime(ends), payload: { cultivationBonus: 20 } }); events = repo.activeEvents(); } return { world: repo.world(), player: data, activities: activity(userName), stages: STAGES, phases: PHASES, buildings: Object.entries(BUILDINGS).map(([key, value]) => ({ key, name: value.name, gain: value.gain })), tiles: repo.tiles(centerQ - 4, centerQ + 4, centerR - 4, centerR + 4), events };
}

function claim(userName, q, r) {
  // 占领与自己领地相邻的空地
  const data = collect(userName); const target = repo.tile(Number(q), Number(r)); if (!target) fail(404, 'REALM_TILE_NOT_FOUND', '这块地还没有进入视野'); if (target.owner) fail(409, 'REALM_TILE_OWNED', '这块地已经有归属'); if (distance(data.homeQ, data.homeR, target.q, target.r) > 20) fail(400, 'REALM_TILE_TOO_FAR', '这块地距离你的邑城太远'); const nearby = repo.tiles(target.q - 1, target.q + 1, target.r - 1, target.r + 1).some(item => item.owner === userName && distance(item.q, item.r, target.q, target.r) === 1); if (!nearby) fail(400, 'REALM_TILE_NOT_ADJACENT', '只能从自己的领地向外扩张'); if (data.grain < 12 || data.wood < 8) fail(400, 'REALM_CLAIM_COST', '圈地需要 12 粮食和 8 木材'); data.grain -= 12; data.wood -= 8; transaction(() => { repo.savePlayer(data); repo.insertTile({ q: target.q, r: target.r, terrain: target.terrain, owner: userName }); }); return overview(userName, target.q, target.r);
}

function build(userName, q, r, building) {
  // 在自己的地块上修建功能建筑
  const data = collect(userName); const target = repo.tile(Number(q), Number(r)); const plan = BUILDINGS[building]; if (!target || target.owner !== userName) fail(400, 'REALM_BUILD_OWNER', '只能在自己的地块上修建'); if (!plan) fail(400, 'REALM_BUILDING_INVALID', '建筑类型不存在'); if (target.building) fail(409, 'REALM_BUILDING_EXISTS', '这块地已经有建筑'); const costs = ['grain','wood','ore','essence']; if (costs.some((key, index) => data[key] < plan.cost[index])) fail(400, 'REALM_BUILD_COST', '现有资源不足以修建该建筑'); costs.forEach((key, index) => { data[key] -= plan.cost[index]; }); transaction(() => { repo.savePlayer(data); repo.insertTile({ q: target.q, r: target.r, terrain: target.terrain, owner: userName, building, level: 1 }); }); return overview(userName, target.q, target.r);
}

function upgrade(userName, q, r) {
  // 提升自己地块上建筑的等级并提高产出
  const data = collect(userName); const target = repo.tile(Number(q), Number(r)); if (!target || target.owner !== userName || !target.building || target.building === 'town') fail(400, 'REALM_UPGRADE_OWNER', '只能升级自己的功能建筑'); const cost = 25 * target.level; if (data.wood < cost || data.ore < cost / 2) fail(400, 'REALM_UPGRADE_COST', '升级需要更多木材和矿石'); data.wood -= cost; data.ore -= Math.floor(cost / 2); target.level += 1; transaction(() => { repo.savePlayer(data); repo.updateTile(target); }); return overview(userName, target.q, target.r);
}

function donate(userName, recipient, amount) {
  // 向另一位已进入世界的玩家捐赠粮食
  const value = Number(amount); const sender = collect(userName); if (typeof recipient !== 'string' || !recipient.trim() || recipient === userName) fail(400, 'REALM_DONATE_RECIPIENT', '捐赠对象必须是另一位玩家'); if (!db.prepare('SELECT name FROM users WHERE name=?').get(recipient)) fail(404, 'REALM_DONATE_USER', '找不到这位玩家'); const target = ensurePlayer(recipient); if (!Number.isSafeInteger(value) || value < 1 || sender.grain < value) fail(400, 'REALM_DONATE_AMOUNT', '捐赠粮食数量无效或余额不足'); sender.grain -= value; target.grain += value; transaction(() => { repo.savePlayer(sender); repo.savePlayer(target); }); return overview(userName, sender.homeQ, sender.homeR);
}

function attack(userName, q, r) {
  // 消耗矿石攻击相邻敌方地块，成功后只夺取目标地块
  const data = collect(userName); const target = repo.tile(Number(q), Number(r)); if (!target?.owner || target.owner === userName) fail(400, 'REALM_ATTACK_TARGET', '目标必须是其他玩家的领地'); if (distance(data.homeQ, data.homeR, target.q, target.r) > 20) fail(400, 'REALM_ATTACK_DISTANCE', '目标距离太远'); if (data.ore < 35) fail(400, 'REALM_ATTACK_COST', '攻击需要 35 矿石'); data.ore -= 35; const success = hash(target.q, target.r, repo.world().seed + data.ore) % 100 < 58; if (success) target.owner = userName; transaction(() => { repo.savePlayer(data); if (success) repo.updateTile(target); }); return { ...overview(userName, target.q, target.r), success, message: success ? '攻击成功，目标地块已纳入你的邑城' : '攻击失败，守军挡住了这次进攻' };
}

function breakthrough(userName) {
  // 消耗修炼经验和阶段材料尝试突破大境界
  const data = collect(userName); const required = 1000 * (data.stage + 1) ** 2; const material = 20 + data.stage * 8; const activities = activity(userName); const activityRequired = 5 + data.stage * 2; if (data.stage >= STAGES.length - 1) fail(400, 'REALM_STAGE_LIMIT', '当前修仙等级已经达到世界上限'); if (data.phase !== PHASES.length - 1) fail(400, 'REALM_PHASE_REQUIRED', '需要先修炼到圆满才能突破大境界'); if (data.cultivationExp < required || data.essence < material || activities.total < activityRequired) fail(400, 'REALM_BREAKTHROUGH_MATERIAL', `突破需要 ${required} 修炼经验、${material} 灵息和 ${activityRequired} 次共同活动`); data.cultivationExp -= required; data.essence -= material; const success = hash(data.stage, data.phase, repo.world().seed + data.cultivationExp) % 100 < Math.min(95, 55 + data.stage * 2); if (success) { data.stage += 1; data.phase = 0; } else data.phase = Math.max(0, data.phase - 2); transaction(() => repo.savePlayer(data)); return { ...overview(userName, data.homeQ, data.homeR), success };
}

function cultivate(userName) {
  // 消耗基础资源将一次主动修炼转化为境界经验
  const data = collect(userName); if (data.grain < 18 || data.essence < 4) fail(400, 'REALM_CULTIVATE_COST', '修炼需要 18 粮食和 4 灵息'); data.grain -= 18; data.essence -= 4; data.cultivationExp += 80 + data.stage * 12; if (data.cultivationExp >= 600 + data.stage * 300 && data.phase < PHASES.length - 1) { data.cultivationExp -= 600 + data.stage * 300; data.phase += 1; } transaction(() => repo.savePlayer(data)); return overview(userName, data.homeQ, data.homeR);
}

function destroyWorld(userName) {
  // 清空迩灵邑世界并生成新的世界种子
  transaction(() => { const next = Math.floor(Math.random() * 2147483647); const current = repo.world(); const db = require('../../../database'); db.exec('DELETE FROM realm_tiles; DELETE FROM realm_players; DELETE FROM realm_events;'); db.prepare('UPDATE realm_world SET seed=?,epoch=?,created_at=datetime(\'now\',\'localtime\') WHERE id=1').run(next, current.epoch + 1); }); return overview(userName);
}

module.exports = { overview, claim, build, upgrade, donate, attack, breakthrough, cultivate, destroyWorld };
