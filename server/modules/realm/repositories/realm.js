// 读写迩灵邑世界、玩家、六边形地块和事件数据
const db = require('../../../database');

function world() {
  // 读取唯一世界状态
  return db.prepare('SELECT id,seed,epoch,created_at AS createdAt FROM realm_world WHERE id=1').get();
}

function resetWorld(seed) {
  // 清理迩灵邑全部运行态数据并重置世界种子
  db.exec('DELETE FROM realm_world_boss_participants; DELETE FROM realm_world_bosses; DELETE FROM realm_world_boss_alliance_rewards; DELETE FROM realm_alliance_relations; DELETE FROM realm_alliance_project_contributions; DELETE FROM realm_alliance_projects; DELETE FROM realm_alliance_war_participants; DELETE FROM realm_alliance_wars; DELETE FROM realm_alliance_members; DELETE FROM realm_alliances; DELETE FROM realm_trade_orders; DELETE FROM realm_tile_explorers; DELETE FROM realm_event_participants; DELETE FROM realm_tiles; DELETE FROM realm_players; DELETE FROM realm_presence; DELETE FROM realm_events; DELETE FROM realm_action_logs; DELETE FROM realm_battle_reports; DELETE FROM realm_daily_quest_claims; DELETE FROM realm_achievement_claims; DELETE FROM realm_season_history;');
  return db.prepare("UPDATE realm_world SET seed=?,epoch=1,created_at=datetime('now','localtime') WHERE id=1").run(seed).changes === 1;
}

function archiveSeason(data) {
  // 保存已结束赛季的排行榜和奖励快照，并返回首次写入结果
  return db.prepare('INSERT OR IGNORE INTO realm_season_history(season_number,started_at,ended_at,rankings,cultivation_rankings) VALUES(?,?,?,?,?)').run(data.seasonNumber, data.startedAt, data.endedAt, JSON.stringify(data.rankings || []), JSON.stringify(data.cultivationRankings || []));
}

function advanceSeason(data) {
  // 原子推进世界赛季编号和起始时间
  return db.prepare("UPDATE realm_world SET epoch=?,created_at=? WHERE id=1 AND epoch=?").run(data.nextNumber, data.startedAt, data.currentNumber).changes === 1;
}

function seasonHistory(limit = 8) {
  // 读取最近赛季的历史排名
  return db.prepare('SELECT season_number AS seasonNumber,started_at AS startedAt,ended_at AS endedAt,rankings,cultivation_rankings AS cultivationRankings FROM realm_season_history ORDER BY season_number DESC LIMIT ?').all(limit).map(item => ({ ...item, rankings: JSON.parse(item.rankings), cultivationRankings: JSON.parse(item.cultivationRankings || '[]') }));
}

function player(name) {
  // 读取玩家的领地与修炼状态
  return db.prepare('SELECT user_name AS userName,home_q AS homeQ,home_r AS homeR,stage,phase,talent,technique,technique_level AS techniqueLevel,cultivation_exp AS cultivationExp,grain,wood,ore,essence,last_collected_at AS lastCollectedAt,shield_until AS shieldUntil,attack_ready_at AS attackReadyAt,gather_ready_at AS gatherReadyAt FROM realm_players WHERE user_name=?').get(name);
}

function touchPresence(userName) {
  // 更新局域网玩家最近活跃时间
  return db.prepare("INSERT INTO realm_presence(user_name,last_seen_at) VALUES(?,datetime('now','localtime')) ON CONFLICT(user_name) DO UPDATE SET last_seen_at=excluded.last_seen_at").run(userName);
}

function onlinePlayers(limit = 30) {
  // 查询最近九十秒访问过迩灵邑的玩家
  return db.prepare("SELECT p.user_name AS userName,r.stage,r.phase,p.last_seen_at AS lastSeenAt FROM realm_presence p JOIN realm_players r ON r.user_name=p.user_name WHERE p.last_seen_at>=datetime('now','localtime','-90 seconds') ORDER BY p.last_seen_at DESC,p.user_name LIMIT ?").all(limit);
}

function setTalent(userName, talent) {
  // 保存玩家首次觉醒的灵根路线
  return db.prepare('UPDATE realm_players SET talent=?,updated_at=datetime(\'now\',\'localtime\') WHERE user_name=? AND talent IS NULL').run(talent, userName).changes === 1;
}

function setTechnique(userName, technique) {
  // 保存玩家首次选择的功法
  return db.prepare('UPDATE realm_players SET technique=?,technique_level=1,updated_at=datetime(\'now\',\'localtime\') WHERE user_name=? AND technique IS NULL').run(technique, userName).changes === 1;
}

function upgradeTechnique(userName, currentLevel) {
  // 原子提升功法等级，防止并发重复升级
  return db.prepare('UPDATE realm_players SET technique_level=technique_level+1,updated_at=datetime(\'now\',\'localtime\') WHERE user_name=? AND technique IS NOT NULL AND technique_level=?').run(userName, currentLevel).changes === 1;
}

function savePlayer(data) {
  // 保存玩家资源与修炼状态
  db.prepare(`UPDATE realm_players SET stage=?,phase=?,cultivation_exp=?,grain=?,wood=?,ore=?,essence=?,last_collected_at=?,shield_until=?,attack_ready_at=?,gather_ready_at=?,updated_at=datetime('now','localtime') WHERE user_name=?`).run(data.stage, data.phase, data.cultivationExp, data.grain, data.wood, data.ore, data.essence, data.lastCollectedAt, data.shieldUntil, data.attackReadyAt, data.gatherReadyAt || 0, data.userName);
}

function insertPlayer(data) {
  // 创建玩家并写入出生点
  db.prepare('INSERT INTO realm_players(user_name,home_q,home_r,shield_until) VALUES(?,?,?,datetime(\'now\',\'localtime\',\'+30 minutes\'))').run(data.userName, data.homeQ, data.homeR);
}

function tile(q, r) {
  // 读取一个六边形地块
  return db.prepare('SELECT q,r,terrain,owner,building,level,specialization,skill_ready_at AS skillReadyAt,discovered_at AS discoveredAt FROM realm_tiles WHERE q=? AND r=?').get(q, r);
}

function insertTile(data) {
  // 写入首次生成的地块
  db.prepare('INSERT OR IGNORE INTO realm_tiles(q,r,terrain,owner,building,level) VALUES(?,?,?,?,?,?)').run(data.q, data.r, data.terrain, data.owner || null, data.building || null, data.level || 0);
  return tile(data.q, data.r);
}

function insertTiles(items) {
  // 批量写入按需生成的地块并保持已有地块不变
  const statement = db.prepare('INSERT OR IGNORE INTO realm_tiles(q,r,terrain,owner,building,level) VALUES(?,?,?,?,?,?)');
  items.forEach(item => statement.run(item.q, item.r, item.terrain, item.owner || null, item.building || null, item.level || 0));
  return items.length;
}

function upgradeTile(q, r, owner, level) {
  // 只有建筑等级未变化时才允许完成一次升级
  return db.prepare('UPDATE realm_tiles SET level=level+1 WHERE q=? AND r=? AND owner=? AND building IS NOT NULL AND building<>? AND level=?').run(q, r, owner, 'town', level).changes === 1;
}

function reserveBuildingSkill(q, r, owner, now, readyAt) {
  // 原子占用建筑技能冷却，避免并发重复领取技能收益
  return db.prepare('UPDATE realm_tiles SET skill_ready_at=? WHERE q=? AND r=? AND owner=? AND COALESCE(skill_ready_at,0)<=?').run(readyAt, q, r, owner, now).changes === 1;
}

function specializeTile(q, r, owner, specialization) {
  // 只有尚未选择专精的建筑才允许写入专精方向
  return db.prepare('UPDATE realm_tiles SET specialization=? WHERE q=? AND r=? AND owner=? AND specialization IS NULL').run(specialization, q, r, owner).changes === 1;
}

function claimTile(q, r, owner) {
  // 将已生成的空地更新为玩家领地
  return db.prepare('UPDATE realm_tiles SET owner=? WHERE q=? AND r=? AND owner IS NULL').run(owner, q, r).changes === 1;
}

function attackTile(q, r, expectedOwner, owner) {
  // 只有目标归属未变化且防守玩家存在时才完成攻击夺地
  return db.prepare('UPDATE realm_tiles SET owner=? WHERE q=? AND r=? AND owner=? AND EXISTS (SELECT 1 FROM realm_players WHERE user_name=?)').run(owner, q, r, expectedOwner, expectedOwner).changes === 1;
}

function buildTile(q, r, owner, building) {
  // 将已生成的己方地块更新为建筑地块
  return db.prepare('UPDATE realm_tiles SET building=?,level=1,specialization=NULL,skill_ready_at=0 WHERE q=? AND r=? AND owner=? AND building IS NULL').run(building, q, r, owner).changes === 1;
}

function demolishTile(q, r, owner, building) {
  // 只有建筑类型未变化时才允许完成一次拆除，避免并发操作覆盖新建筑
  return db.prepare('UPDATE realm_tiles SET building=NULL,level=0,specialization=NULL,skill_ready_at=0 WHERE q=? AND r=? AND owner=? AND building=? AND building<>?').run(q, r, owner, building, 'town').changes === 1;
}

function tiles(minQ, maxQ, minR, maxR, userName = null) {
  // 按视口范围读取已生成地块
  return db.prepare("SELECT t.q,t.r,t.terrain,t.owner,t.building,t.level,t.specialization,t.skill_ready_at AS skillReadyAt,t.discovered_at AS discoveredAt,CASE WHEN ? IS NULL THEN 0 ELSE EXISTS(SELECT 1 FROM realm_tile_explorers e WHERE e.q=t.q AND e.r=t.r AND e.user_name=?) END AS explored FROM realm_tiles t WHERE t.q BETWEEN ? AND ? AND t.r BETWEEN ? AND ? ORDER BY t.r,t.q").all(userName, userName, minQ, maxQ, minR, maxR).map(item => ({ ...item, explored: Boolean(item.explored) }));
}

function exploreTile(q, r, userName) {
  // 原子记录遗迹探索者，保证每块遗迹每人只能探索一次
  return db.prepare("INSERT OR IGNORE INTO realm_tile_explorers(q,r,user_name) SELECT q,r,? FROM realm_tiles WHERE q=? AND r=? AND terrain='遗迹'").run(userName, q, r).changes === 1;
}

function explorationCount(userName) {
  // 统计玩家已经完成的遗迹探索次数
  return db.prepare('SELECT COUNT(*) AS count FROM realm_tile_explorers WHERE user_name=?').get(userName).count;
}

function ownedTiles(userName) {
  // 通过归属索引读取产出所需地块，不限制玩家扩张半径
  return db.prepare('SELECT terrain,building,level,specialization FROM realm_tiles WHERE owner=? AND building IS NOT NULL').all(userName);
}

function reserveGather(userName, now) {
  // 原子领取点击采集额度，限制为每秒一次
  return db.prepare('UPDATE realm_players SET gather_ready_at=? WHERE user_name=? AND COALESCE(gather_ready_at,0)<=?').run(now + 1000, userName, now).changes === 1;
}

function activeEvents(userName = null) {
  // 读取当前生效事件并标记当前玩家是否已经参与
  const events = db.prepare("SELECT e.id,e.kind,e.title,e.description,e.q,e.r,e.payload,e.starts_at AS startsAt,e.ends_at AS endsAt,(SELECT COUNT(*) FROM realm_event_participants p2 WHERE p2.event_id=e.id) AS participantCount,CASE WHEN ? IS NULL THEN 0 ELSE EXISTS(SELECT 1 FROM realm_event_participants p WHERE p.event_id=e.id AND p.user_name=?) END AS participated FROM realm_events e WHERE e.starts_at<=datetime('now','localtime') AND e.ends_at>datetime('now','localtime') ORDER BY e.id DESC").all(userName, userName).map(item => ({ ...item, payload: JSON.parse(item.payload), participantCount: Number(item.participantCount), participated: Boolean(item.participated) }));
  return events;
}

function insertEvent(data) {
  // 创建世界特殊事件
  return db.prepare('INSERT INTO realm_events(kind,title,description,q,r,starts_at,ends_at,payload) VALUES(?,?,?,?,?,?,?,?)').run(data.kind, data.title, data.description, data.q ?? null, data.r ?? null, data.startsAt, data.endsAt, JSON.stringify(data.payload || {}));
}

function activeEvent(id, userName = null) {
  // 读取指定的当前事件并返回玩家参与状态
  return activeEvents(userName).find(item => item.id === Number(id)) || null;
}

function claimEventParticipation(eventId, userName) {
  // 原子记录玩家参与事件，避免重复领取奖励
  return db.prepare('INSERT OR IGNORE INTO realm_event_participants(event_id,user_name) VALUES(?,?)').run(eventId, userName).changes === 1;
}

function eventParticipantCount(eventId) {
  // 读取协作事件的全服参与人数
  return db.prepare('SELECT COUNT(*) AS count FROM realm_event_participants WHERE event_id=?').get(eventId).count;
}

function activeWorldBoss() {
  // 读取当前场次的世界首领，击杀后保留战报直到场次结束
  return db.prepare("SELECT id,cycle,kind,name,description,max_hp AS maxHp,current_hp AS currentHp,starts_at AS startsAt,ends_at AS endsAt,q,r,defeated_at AS defeatedAt FROM realm_world_bosses WHERE starts_at<=datetime('now','localtime') AND ends_at>datetime('now','localtime') ORDER BY id DESC LIMIT 1").get();
}

function worldBossByCycle(cycle) {
  // 查询指定时间周期是否已经生成过世界首领
  return db.prepare('SELECT id FROM realm_world_bosses WHERE cycle=?').get(cycle);
}

function insertWorldBoss(data) {
  // 写入一个新的世界首领场次
  return db.prepare('INSERT OR IGNORE INTO realm_world_bosses(cycle,kind,name,description,max_hp,current_hp,starts_at,ends_at,q,r) VALUES(?,?,?,?,?,?,?,?,?,?)').run(data.cycle, data.kind, data.name, data.description, data.maxHp, data.maxHp, data.startsAt, data.endsAt, data.q, data.r);
}

function worldBoss(id) {
  // 读取指定世界首领及当前血量
  return db.prepare('SELECT id,cycle,kind,name,description,max_hp AS maxHp,current_hp AS currentHp,starts_at AS startsAt,ends_at AS endsAt,q,r,defeated_at AS defeatedAt FROM realm_world_bosses WHERE id=?').get(id);
}

function worldBossParticipant(bossId, userName) {
  // 读取玩家在当前首领场次的伤害与冷却
  return db.prepare('SELECT boss_id AS bossId,user_name AS userName,alliance_name AS allianceName,damage,attacks,last_attack_at AS lastAttackAt,rewarded FROM realm_world_boss_participants WHERE boss_id=? AND user_name=?').get(bossId, userName);
}

function addWorldBossDamage(data) {
  // 原子累计玩家伤害并扣减首领血量
  const changed = db.prepare("UPDATE realm_world_bosses SET current_hp=MAX(0,current_hp-?) WHERE id=? AND defeated_at IS NULL AND ends_at>datetime('now','localtime')").run(data.damage, data.bossId).changes === 1; if (!changed) return false; db.prepare('INSERT INTO realm_world_boss_participants(boss_id,user_name,alliance_name,damage,attacks,last_attack_at) VALUES(?,?,?,?,?,?) ON CONFLICT(boss_id,user_name) DO UPDATE SET damage=damage+excluded.damage,attacks=attacks+1,last_attack_at=excluded.last_attack_at').run(data.bossId, data.userName, data.allianceName || null, data.damage, 1, data.now); return true;
}

function defeatWorldBoss(bossId) {
  // 幂等记录世界首领击杀时间
  return db.prepare("UPDATE realm_world_bosses SET current_hp=0,defeated_at=datetime('now','localtime') WHERE id=? AND defeated_at IS NULL").run(bossId).changes === 1;
}

function worldBossParticipants(bossId) {
  // 读取世界首领的全部参战记录，用于击杀结算
  return db.prepare('SELECT user_name AS userName,alliance_name AS allianceName,damage,attacks,last_attack_at AS lastAttackAt,rewarded FROM realm_world_boss_participants WHERE boss_id=? ORDER BY damage DESC,user_name').all(bossId);
}

function worldBossRanking(bossId, limit = 5) {
  // 只读取页面需要展示的世界首领贡献榜
  return db.prepare('SELECT user_name AS userName,damage,attacks FROM realm_world_boss_participants WHERE boss_id=? ORDER BY damage DESC,user_name LIMIT ?').all(bossId, limit);
}

function worldBossParticipantCount(bossId) {
  // 统计世界首领参战人数
  return db.prepare('SELECT COUNT(*) AS count FROM realm_world_boss_participants WHERE boss_id=?').get(bossId).count;
}

function worldBossParticipantRank(bossId, userName) {
  // 计算玩家在世界首领伤害榜中的当前名次
  const row = db.prepare('SELECT damage FROM realm_world_boss_participants WHERE boss_id=? AND user_name=?').get(bossId, userName); if (!row) return null; return Number(db.prepare('SELECT COUNT(*) AS count FROM realm_world_boss_participants WHERE boss_id=? AND (damage>? OR (damage=? AND user_name<?))').get(bossId, row.damage, row.damage, userName).count) + 1;
}

function worldBossAllianceRanking(bossId, limit = 5) {
  // 按攻击时的联盟快照统计首领伤害榜
  return db.prepare('SELECT alliance_name AS allianceName,SUM(damage) AS damage,COUNT(*) AS members FROM realm_world_boss_participants WHERE boss_id=? AND alliance_name IS NOT NULL GROUP BY alliance_name ORDER BY damage DESC,alliance_name LIMIT ?').all(bossId, limit);
}

function recordWorldBossAllianceReward(data) {
  // 记录并幂等发放世界首领联盟仓库奖励
  const inserted = db.prepare('INSERT OR IGNORE INTO realm_world_boss_alliance_rewards(boss_id,alliance_name,rank,grain,wood,ore,essence,delivered) VALUES(?,?,?,?,?,?,?,0)').run(data.bossId, data.allianceName, data.rank, data.reward.grain, data.reward.wood, data.reward.ore, data.reward.essence).changes === 1; if (!inserted || !data.allianceId) return inserted; db.prepare('UPDATE realm_alliances SET grain=grain+?,wood=wood+?,ore=ore+?,essence=essence+? WHERE id=?').run(data.reward.grain, data.reward.wood, data.reward.ore, data.reward.essence, data.allianceId); db.prepare('UPDATE realm_world_boss_alliance_rewards SET delivered=1 WHERE boss_id=? AND alliance_name=?').run(data.bossId, data.allianceName); return true;
}

function worldBossAllianceRewards(bossId) {
  // 读取世界首领联盟奖励发放凭证
  return db.prepare('SELECT alliance_name AS allianceName,rank,grain,wood,ore,essence,delivered FROM realm_world_boss_alliance_rewards WHERE boss_id=? ORDER BY rank').all(bossId);
}

function pendingWorldBossAllianceRewards(allianceName) {
  // 读取指定联盟尚未入仓的世界首领奖励
  return db.prepare('SELECT boss_id AS bossId,alliance_name AS allianceName,rank,grain,wood,ore,essence FROM realm_world_boss_alliance_rewards WHERE alliance_name=? AND delivered=0 ORDER BY boss_id').all(allianceName);
}

function deliverWorldBossAllianceReward(data) {
  // 原子领取一笔联盟首领奖励并写入联盟仓库
  const changed = db.prepare('UPDATE realm_world_boss_alliance_rewards SET delivered=1 WHERE boss_id=? AND alliance_name=? AND delivered=0').run(data.bossId, data.allianceName).changes === 1; if (!changed) return false; const allianceChanged = db.prepare('UPDATE realm_alliances SET grain=grain+?,wood=wood+?,ore=ore+?,essence=essence+? WHERE id=?').run(data.reward.grain, data.reward.wood, data.reward.ore, data.reward.essence, data.allianceId).changes === 1; return allianceChanged;
}

function markWorldBossRewarded(bossId, userName) {
  // 原子标记玩家已经领取首领奖励
  return db.prepare('UPDATE realm_world_boss_participants SET rewarded=1 WHERE boss_id=? AND user_name=? AND rewarded=0').run(bossId, userName).changes === 1;
}

function logAction(data) {
  // 记录可追溯的领地行动结果
  return db.prepare('INSERT INTO realm_action_logs(actor,action,target_q,target_r,result) VALUES(?,?,?,?,?)').run(data.actor, data.action, data.q ?? null, data.r ?? null, data.result);
}

function recentActions(limit = 20) {
  // 读取世界最近的关键行动动态
  return db.prepare('SELECT id,actor,action,target_q AS q,target_r AS r,result,created_at AS createdAt FROM realm_action_logs ORDER BY id DESC LIMIT ?').all(limit);
}

function insertBattleReport(data) {
  // 保存一次攻防结果，供双方复盘最近战况
  return db.prepare('INSERT INTO realm_battle_reports(attacker,defender,target_q,target_r,success,plunder,war_point) VALUES(?,?,?,?,?,?,?)').run(data.attacker, data.defender, data.q, data.r, data.success ? 1 : 0, JSON.stringify(data.plunder || {}), Number(data.warPoint || 0));
}

function battleReports(userName, limit = 10) {
  // 查询玩家作为攻守双方参与的最近战报
  return db.prepare('SELECT id,attacker,defender,target_q AS q,target_r AS r,success,plunder,war_point AS warPoint,created_at AS createdAt FROM realm_battle_reports WHERE attacker=? OR defender=? ORDER BY id DESC LIMIT ?').all(userName, userName, limit).map(item => ({ ...item, success: Boolean(item.success), warPoint: Number(item.warPoint || 0), plunder: JSON.parse(item.plunder) }));
}

function dailyActionCount(userName, action) {
  // 统计玩家今天完成指定行动的次数
  return Number(db.prepare("SELECT COUNT(*) AS count FROM realm_action_logs WHERE actor=? AND action=? AND created_at>=datetime('now','localtime','start of day')").get(userName, action).count);
}

function actionCount(userName, action) {
  // 统计玩家完成指定行为的累计次数
  return Number(db.prepare('SELECT COUNT(*) AS count FROM realm_action_logs WHERE actor=? AND action=?').get(userName, action).count);
}

function defenseStats(userName) {
  // 聚合读取玩家作为防守方的成功与失守次数
  const row = db.prepare('SELECT COALESCE(SUM(CASE WHEN success=0 THEN 1 ELSE 0 END),0) AS wins, COALESCE(SUM(CASE WHEN success=1 THEN 1 ELSE 0 END),0) AS losses FROM realm_battle_reports WHERE defender=?').get(userName);
  return { wins: Number(row.wins), losses: Number(row.losses) };
}

function dailyQuestClaimed(userName, questKey) {
  // 查询玩家今天是否已经领取指定悬赏
  return Boolean(db.prepare("SELECT 1 FROM realm_daily_quest_claims WHERE user_name=? AND quest_date=date('now','localtime') AND quest_key=?").get(userName, questKey));
}

function claimDailyQuest(userName, questKey) {
  // 写入每日悬赏领取凭证并保证并发幂等
  return db.prepare("INSERT OR IGNORE INTO realm_daily_quest_claims(user_name,quest_date,quest_key) VALUES(?,date('now','localtime'),?)").run(userName, questKey).changes === 1;
}

function achievementClaimed(userName, achievementKey) {
  // 查询功勋是否已经领取
  return Boolean(db.prepare('SELECT 1 FROM realm_achievement_claims WHERE user_name=? AND achievement_key=?').get(userName, achievementKey));
}

function claimAchievement(userName, achievementKey) {
  // 写入永久功勋凭证并保证并发幂等
  return db.prepare('INSERT OR IGNORE INTO realm_achievement_claims(user_name,achievement_key) VALUES(?,?)').run(userName, achievementKey).changes === 1;
}

function openTradeOrders(limit = 30) {
  // 读取交易所当前未过期的可成交订单
  return db.prepare("SELECT id,seller,offer_resource AS offerResource,offer_amount AS offerAmount,want_resource AS wantResource,want_amount AS wantAmount,created_at AS createdAt,expires_at AS expiresAt FROM realm_trade_orders WHERE status='open' AND (expires_at IS NULL OR expires_at>datetime('now','localtime')) ORDER BY id DESC LIMIT ?").all(limit);
}

function tradeOrder(orderId) {
  // 读取单笔交易订单及其托管状态
  return db.prepare('SELECT id,seller,offer_resource AS offerResource,offer_amount AS offerAmount,want_resource AS wantResource,want_amount AS wantAmount,status,filled_by AS filledBy,created_at AS createdAt,filled_at AS filledAt,expires_at AS expiresAt FROM realm_trade_orders WHERE id=?').get(orderId);
}

function insertTradeOrder(data) {
  // 创建一笔带有效期的资源托管订单
  return db.prepare('INSERT INTO realm_trade_orders(seller,offer_resource,offer_amount,want_resource,want_amount,expires_at) VALUES(?,?,?,?,?,?)').run(data.seller, data.offerResource, data.offerAmount, data.wantResource, data.wantAmount, data.expiresAt);
}

function claimTradeOrder(orderId, buyer) {
  // 原子锁定订单，防止多个买家重复成交
  return db.prepare("UPDATE realm_trade_orders SET status='filled',filled_by=?,filled_at=datetime('now','localtime') WHERE id=? AND status='open' AND (expires_at IS NULL OR expires_at>datetime('now','localtime'))").run(buyer, orderId).changes === 1;
}

function cancelTradeOrder(orderId, seller) {
  // 原子关闭卖方自己的未成交订单
  return db.prepare("UPDATE realm_trade_orders SET status='cancelled' WHERE id=? AND seller=? AND status='open'").run(orderId, seller).changes === 1;
}

function expiredTradeOrders() {
  // 读取已经过期但仍托管资源的订单
  return db.prepare("SELECT id,seller,offer_resource AS offerResource,offer_amount AS offerAmount FROM realm_trade_orders WHERE status='open' AND expires_at IS NOT NULL AND expires_at<=datetime('now','localtime') ORDER BY id").all();
}

function expireTradeOrder(orderId) {
  // 原子关闭过期订单，配合服务层退回托管资源
  return db.prepare("UPDATE realm_trade_orders SET status='cancelled' WHERE id=? AND status='open' AND expires_at IS NOT NULL AND expires_at<=datetime('now','localtime')").run(orderId).changes === 1;
}

function ranking(limit = 20) {
  // 按领地数量和修炼境界返回世界排名
  return db.prepare(`SELECT p.user_name AS userName,p.stage,p.phase,p.cultivation_exp AS cultivationExp,COUNT(t.owner) AS territory FROM realm_players p LEFT JOIN realm_tiles t ON t.owner=p.user_name GROUP BY p.user_name ORDER BY territory DESC,p.stage DESC,p.phase DESC,p.cultivation_exp DESC LIMIT ?`).all(limit);
}

function cultivationRanking(limit = 20) {
  // 按大境界、小阶段和修炼经验返回修炼榜
  return db.prepare(`SELECT user_name AS userName,stage,phase,cultivation_exp AS cultivationExp FROM realm_players ORDER BY stage DESC,phase DESC,cultivation_exp DESC,user_name LIMIT ?`).all(limit);
}

function alliance(userName) {
  // 读取玩家所属联盟和联盟仓库
  const row = db.prepare(`SELECT a.id,a.name,a.leader,a.grain,a.wood,a.ore,a.essence,m.role,m.contribution FROM realm_alliance_members m JOIN realm_alliances a ON a.id=m.alliance_id WHERE m.user_name=?`).get(userName); if (!row) return null; row.members = db.prepare('SELECT user_name AS userName,role,contribution FROM realm_alliance_members WHERE alliance_id=? ORDER BY contribution DESC,joined_at').all(row.id); row.projects = db.prepare('SELECT project_key AS projectKey,level,progress FROM realm_alliance_projects WHERE alliance_id=? ORDER BY project_key').all(row.id); row.projectContributions = projectContributions(row.id); return row;
}

function allianceByName(name) {
  // 按名称查询联盟
  return db.prepare('SELECT id,name,leader,grain,wood,ore,essence FROM realm_alliances WHERE name=?').get(name);
}

function allianceById(id) {
  // 按编号查询联盟当前盟主，用于结算动态
  return db.prepare('SELECT id,name,leader FROM realm_alliances WHERE id=?').get(id);
}

function allianceRelations(allianceId) {
  // 读取联盟收到或发出的外交关系
  return db.prepare("SELECT r.rowid AS relationId,r.alliance_a_id AS allianceAId,r.alliance_b_id AS allianceBId,r.kind,r.status,r.proposer_alliance_id AS proposerAllianceId,r.created_at AS createdAt,r.responded_at AS respondedAt,CASE WHEN r.alliance_a_id=? THEN r.alliance_b_id ELSE r.alliance_a_id END AS targetAllianceId,CASE WHEN r.alliance_a_id=? THEN b.name ELSE a.name END AS targetName FROM realm_alliance_relations r JOIN realm_alliances a ON a.id=r.alliance_a_id JOIN realm_alliances b ON b.id=r.alliance_b_id WHERE r.alliance_a_id=? OR r.alliance_b_id=? ORDER BY r.status,r.created_at DESC").all(allianceId, allianceId, allianceId, allianceId);
}

function allianceRelation(allianceAId, allianceBId) {
  // 查询两个联盟之间当前生效的外交关系
  const low = Math.min(allianceAId, allianceBId); const high = Math.max(allianceAId, allianceBId); return db.prepare("SELECT alliance_a_id AS allianceAId,alliance_b_id AS allianceBId,kind,status,proposer_alliance_id AS proposerAllianceId FROM realm_alliance_relations WHERE alliance_a_id=? AND alliance_b_id=? AND status='active'").get(low, high);
}

function allianceRelationById(relationId) {
  // 按关系主键读取外交申请
  return db.prepare('SELECT rowid AS relationId,alliance_a_id AS allianceAId,alliance_b_id AS allianceBId,kind,status,proposer_alliance_id AS proposerAllianceId FROM realm_alliance_relations WHERE rowid=?').get(relationId);
}

function upsertAllianceRelation(data) {
  // 创建新的外交申请并复用已经结束的关系记录
  const low = Math.min(data.allianceAId, data.allianceBId); const high = Math.max(data.allianceAId, data.allianceBId); return db.prepare("INSERT INTO realm_alliance_relations(alliance_a_id,alliance_b_id,kind,status,proposer_alliance_id) VALUES(?,?,?,'pending',?) ON CONFLICT(alliance_a_id,alliance_b_id) DO UPDATE SET kind=excluded.kind,status='pending',proposer_alliance_id=excluded.proposer_alliance_id,created_at=datetime('now','localtime'),responded_at=NULL WHERE realm_alliance_relations.status IN ('declined','ended')").run(low, high, data.kind, data.proposerAllianceId).changes === 1;
}

function respondAllianceRelation(data) {
  // 原子处理外交申请的接受或拒绝
  return db.prepare("UPDATE realm_alliance_relations SET status=?,responded_at=datetime('now','localtime') WHERE alliance_a_id=? AND alliance_b_id=? AND status='pending'").run(data.status, Math.min(data.allianceAId, data.allianceBId), Math.max(data.allianceAId, data.allianceBId)).changes === 1;
}

function endAllianceRelation(data) {
  // 主动结束已生效的外交关系
  return db.prepare("UPDATE realm_alliance_relations SET status='ended',responded_at=datetime('now','localtime') WHERE alliance_a_id=? AND alliance_b_id=? AND status='active'").run(Math.min(data.allianceAId, data.allianceBId), Math.max(data.allianceAId, data.allianceBId)).changes === 1;
}

function insertAlliance(name, leader) {
  // 创建联盟及首位成员
  const result = db.prepare('INSERT OR IGNORE INTO realm_alliances(name,leader) VALUES(?,?)').run(name, leader); if (result.changes !== 1) return null; db.prepare("INSERT INTO realm_alliance_members(alliance_id,user_name,role) VALUES(?,?, 'leader')").run(result.lastInsertRowid, leader); return alliance(leader);
}

function joinAlliance(allianceId, userName) {
  // 将玩家加入联盟
  const result = db.prepare("INSERT OR IGNORE INTO realm_alliance_members(alliance_id,user_name) VALUES(?,?)").run(allianceId, userName); return result.changes === 1 ? alliance(userName) : null;
}

function removeAllianceMember(userName) {
  // 移除联盟成员
  return db.prepare('DELETE FROM realm_alliance_members WHERE user_name=?').run(userName);
}

function addAllianceResources(data) {
  // 增加联盟仓库并记录成员贡献
  db.prepare('UPDATE realm_alliances SET grain=grain+?,wood=wood+?,ore=ore+?,essence=essence+? WHERE id=?').run(data.grain, data.wood, data.ore, data.essence, data.allianceId); db.prepare('UPDATE realm_alliance_members SET contribution=contribution+? WHERE alliance_id=? AND user_name=?').run(data.contribution, data.allianceId, data.userName);
}

function spendAllianceGrain(allianceId, amount) {
  // 原子扣除联盟工程使用的仓库粮食
  return db.prepare('UPDATE realm_alliances SET grain=grain-? WHERE id=? AND grain>=?').run(amount, allianceId, amount).changes === 1;
}

function updateAllianceLeader(allianceId, currentLeader, userName) {
  // 原子确认原盟主和目标成员后同步联盟角色
  const changed = db.prepare('UPDATE realm_alliances SET leader=? WHERE id=? AND leader=? AND EXISTS (SELECT 1 FROM realm_alliance_members WHERE alliance_id=? AND user_name=?)').run(userName, allianceId, currentLeader, allianceId, userName).changes === 1; if (!changed) return false; db.prepare("UPDATE realm_alliance_members SET role='member' WHERE alliance_id=?").run(allianceId); db.prepare("UPDATE realm_alliance_members SET role='leader' WHERE alliance_id=? AND user_name=?").run(allianceId, userName); return true;
}

function deleteAlliance(allianceId) {
  // 解散联盟及其成员关系
  db.prepare('DELETE FROM realm_alliance_members WHERE alliance_id=?').run(allianceId); return db.prepare('DELETE FROM realm_alliances WHERE id=?').run(allianceId);
}

function addAllianceProject(data) {
  // 累加联盟公共工程进度并按投入量连续提升多个等级
  db.prepare('INSERT OR IGNORE INTO realm_alliance_projects(alliance_id,project_key) VALUES(?,?)').run(data.allianceId, data.projectKey); db.prepare('UPDATE realm_alliance_projects SET progress=progress+? WHERE alliance_id=? AND project_key=?').run(data.progress, data.allianceId, data.projectKey); let project = db.prepare('SELECT project_key AS projectKey,level,progress FROM realm_alliance_projects WHERE alliance_id=? AND project_key=?').get(data.allianceId, data.projectKey); while (project.progress >= data.required) { db.prepare('UPDATE realm_alliance_projects SET level=level+1,progress=progress-? WHERE alliance_id=? AND project_key=?').run(data.required, data.allianceId, data.projectKey); project = db.prepare('SELECT project_key AS projectKey,level,progress FROM realm_alliance_projects WHERE alliance_id=? AND project_key=?').get(data.allianceId, data.projectKey); } return project;
}

function addAllianceProjectContribution(data) {
  // 保存成员对公共工程的本次投入来源和数量
  return db.prepare('INSERT INTO realm_alliance_project_contributions(alliance_id,user_name,project_key,source,amount) VALUES(?,?,?,?,?)').run(data.allianceId, data.userName, data.projectKey, data.source, data.amount);
}

function projectContributions(allianceId) {
  // 汇总联盟成员对各公共工程的投入排名
  return db.prepare('SELECT project_key AS projectKey,user_name AS userName,source,SUM(amount) AS amount FROM realm_alliance_project_contributions WHERE alliance_id=? GROUP BY project_key,user_name,source ORDER BY project_key,amount DESC,userName').all(allianceId);
}

function activeWars(userName) {
  // 读取玩家所属联盟的进行中战争
  return db.prepare("SELECT w.id,w.attacker_alliance_id AS attackerAllianceId,aa.name AS attackerName,w.defender_alliance_id AS defenderAllianceId,da.name AS defenderName,w.attacker_score AS attackerScore,w.defender_score AS defenderScore,w.starts_at AS startsAt,w.ends_at AS endsAt FROM realm_alliance_wars w JOIN realm_alliance_members m ON m.alliance_id IN (w.attacker_alliance_id,w.defender_alliance_id) JOIN realm_alliances aa ON aa.id=w.attacker_alliance_id JOIN realm_alliances da ON da.id=w.defender_alliance_id WHERE m.user_name=? AND w.ends_at>datetime('now','localtime') ORDER BY w.id DESC").all(userName);
}

function recentWars(userName) {
  // 读取玩家所属联盟最近五场战争及结算结果
  const rows = db.prepare("SELECT w.id,w.attacker_alliance_id AS attackerAllianceId,aa.name AS attackerName,w.defender_alliance_id AS defenderAllianceId,da.name AS defenderName,w.attacker_score AS attackerScore,w.defender_score AS defenderScore,w.starts_at AS startsAt,w.ends_at AS endsAt,w.settled_at AS settledAt,w.winner_alliance_id AS winnerAllianceId,m.alliance_id AS ownAllianceId,COALESCE((SELECT points FROM realm_alliance_war_participants p WHERE p.war_id=w.id AND p.user_name=?),0) AS ownPoints FROM realm_alliance_wars w JOIN realm_alliance_members m ON m.alliance_id IN (w.attacker_alliance_id,w.defender_alliance_id) JOIN realm_alliances aa ON aa.id=w.attacker_alliance_id JOIN realm_alliances da ON da.id=w.defender_alliance_id WHERE m.user_name=? ORDER BY w.id DESC LIMIT 5").all(userName, userName);
  if (!rows.length) return [];
  const ranking = db.prepare('SELECT war_id AS warId, user_name AS userName, points FROM realm_alliance_war_participants WHERE war_id IN (' + rows.map(() => '?').join(',') + ') AND alliance_id=? ORDER BY points DESC,user_name').all(...rows.map(item => item.id), rows[0].ownAllianceId);
  return rows.map(item => ({ ...item, ownRank: warParticipantRank(item.id, item.ownAllianceId, userName), participants: ranking.filter(entry => entry.warId === item.id).slice(0, 3) }));
}

function warBetween(attackerAllianceId, defenderAllianceId) {
  // 查询两个联盟之间尚未结束的战争
  return db.prepare("SELECT id,attacker_alliance_id AS attackerAllianceId,defender_alliance_id AS defenderAllianceId,attacker_score AS attackerScore,defender_score AS defenderScore,starts_at AS startsAt,ends_at AS endsAt FROM realm_alliance_wars WHERE ((attacker_alliance_id=? AND defender_alliance_id=?) OR (attacker_alliance_id=? AND defender_alliance_id=?)) AND ends_at>datetime('now','localtime') ORDER BY id DESC LIMIT 1").get(attackerAllianceId, defenderAllianceId, defenderAllianceId, attackerAllianceId);
}

function activeWarForAlliance(allianceId) {
  // 查询联盟当前参与的战争
  return db.prepare("SELECT id,attacker_alliance_id AS attackerAllianceId,defender_alliance_id AS defenderAllianceId,ends_at AS endsAt FROM realm_alliance_wars WHERE (attacker_alliance_id=? OR defender_alliance_id=?) AND ends_at>datetime('now','localtime') ORDER BY id DESC LIMIT 1").get(allianceId, allianceId);
}

function warCooldown(attackerAllianceId, defenderAllianceId) {
  // 查询两个联盟最近一场已结算战争的结束时间
  return db.prepare("SELECT settled_at AS settledAt FROM realm_alliance_wars WHERE settled_at IS NOT NULL AND ((attacker_alliance_id=? AND defender_alliance_id=?) OR (attacker_alliance_id=? AND defender_alliance_id=?)) ORDER BY settled_at DESC LIMIT 1").get(attackerAllianceId, defenderAllianceId, defenderAllianceId, attackerAllianceId);
}

function insertWar(data) {
  // 原子创建限时联盟战争，避免并发宣战产生重复未结算战争
  return db.prepare("INSERT INTO realm_alliance_wars(attacker_alliance_id,defender_alliance_id,ends_at) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM realm_alliance_wars WHERE settled_at IS NULL AND ((attacker_alliance_id=? AND defender_alliance_id=?) OR (attacker_alliance_id=? AND defender_alliance_id=?)))").run(data.attackerAllianceId, data.defenderAllianceId, data.endsAt, data.attackerAllianceId, data.defenderAllianceId, data.defenderAllianceId, data.attackerAllianceId).changes === 1;
}

function addWarScore(warId, side) {
  // 为战争指定阵营增加一次成功攻击积分
  if (!['attacker_score', 'defender_score'].includes(side)) throw new Error('战争阵营字段无效');
  return db.prepare(`UPDATE realm_alliance_wars SET ${side}=${side}+1 WHERE id=? AND ends_at>datetime('now','localtime')`).run(warId).changes === 1;
}

function expiredWars() {
  // 读取已经到期但尚未结算的联盟战争
  return db.prepare("SELECT id,attacker_alliance_id AS attackerAllianceId,defender_alliance_id AS defenderAllianceId,attacker_score AS attackerScore,defender_score AS defenderScore FROM realm_alliance_wars WHERE settled_at IS NULL AND ends_at<=datetime('now','localtime')").all();
}

function settleWar(warId, winnerAllianceId) {
  // 一次性记录战争胜负
  return db.prepare("UPDATE realm_alliance_wars SET settled_at=datetime('now','localtime'),winner_alliance_id=? WHERE id=? AND settled_at IS NULL").run(winnerAllianceId, warId).changes === 1;
}

function rewardAllianceWarehouse(allianceId, reward) {
  // 将战争奖励注入获胜联盟仓库
  return db.prepare('UPDATE realm_alliances SET grain=grain+?,wood=wood+?,ore=ore+?,essence=essence+? WHERE id=?').run(reward.grain, reward.wood, reward.ore, reward.essence, allianceId);
}

function addWarParticipant(warId, userName, allianceId) {
  // 累加玩家在战争中的成功攻击贡献
  db.prepare('INSERT INTO realm_alliance_war_participants(war_id,user_name,alliance_id,points) VALUES(?,?,?,1) ON CONFLICT(war_id,user_name) DO UPDATE SET points=points+1').run(warId, userName, allianceId);
}

function warParticipants(warId, allianceId) {
  // 按贡献读取指定联盟的战争参战排名
  return db.prepare('SELECT user_name AS userName,points FROM realm_alliance_war_participants WHERE war_id=? AND alliance_id=? ORDER BY points DESC,user_name LIMIT 3').all(warId, allianceId);
}

function warParticipantRank(warId, allianceId, userName) {
  // 按积分和用户名稳定计算玩家在本盟战争贡献榜的名次
  const row = db.prepare('SELECT points FROM realm_alliance_war_participants WHERE war_id=? AND alliance_id=? AND user_name=?').get(warId, allianceId, userName);
  if (!row) return null;
  return Number(db.prepare('SELECT COUNT(*) AS count FROM realm_alliance_war_participants WHERE war_id=? AND alliance_id=? AND (points>? OR (points=? AND user_name<?))').get(warId, allianceId, row.points, row.points, userName).count) + 1;
}

module.exports = { world, resetWorld, archiveSeason, advanceSeason, seasonHistory, player, savePlayer, insertPlayer, tile, insertTile, insertTiles, touchPresence, onlinePlayers, setTalent, setTechnique, upgradeTechnique, upgradeTile, reserveBuildingSkill, specializeTile, claimTile, buildTile, demolishTile, attackTile, tiles, ownedTiles, reserveGather, exploreTile, explorationCount, activeEvents, activeEvent, insertEvent, claimEventParticipation, eventParticipantCount, activeWorldBoss, worldBossByCycle, insertWorldBoss, worldBoss, worldBossParticipant, addWorldBossDamage, defeatWorldBoss, worldBossParticipants, worldBossRanking, worldBossParticipantCount, worldBossParticipantRank, worldBossAllianceRanking, recordWorldBossAllianceReward, worldBossAllianceRewards, pendingWorldBossAllianceRewards, deliverWorldBossAllianceReward, markWorldBossRewarded, logAction, recentActions, insertBattleReport, battleReports, dailyActionCount, actionCount, defenseStats, dailyQuestClaimed, claimDailyQuest, achievementClaimed, claimAchievement, openTradeOrders, tradeOrder, insertTradeOrder, claimTradeOrder, cancelTradeOrder, expiredTradeOrders, expireTradeOrder, ranking, cultivationRanking, alliance, allianceRelations, allianceRelation, allianceRelationById, upsertAllianceRelation, respondAllianceRelation, endAllianceRelation, activeWars, recentWars, warBetween, activeWarForAlliance, warCooldown, insertWar, addWarScore, expiredWars, settleWar, rewardAllianceWarehouse, addWarParticipant, warParticipants, warParticipantRank, allianceByName, allianceById, insertAlliance, joinAlliance, removeAllianceMember, addAllianceResources, spendAllianceGrain, updateAllianceLeader, deleteAlliance, addAllianceProject, addAllianceProjectContribution, projectContributions };
