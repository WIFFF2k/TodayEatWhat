// 编排迩灵邑的地图生成、资源、领地、建筑、修炼、事件、联盟和赛季规则
const { fail } = require('../../../shared/errors');
const transaction = require('../../../database/transaction');
const repo = require('../repositories/realm');
const { hasUser } = require('../../identity/repositories/users');
const { activity } = require('./activityProvider');

const STAGES = ['炼体','练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫','真仙','金仙','太乙','大罗','道祖'];
const PHASES = ['初期','中期','后期','半步圆满','圆满'];
const TALENTS = {
  earth: { name: '厚土灵根', description: '自动与主动获得粮食、木材提高 15%', resource: { grain: 1.15, wood: 1.15 } },
  metal: { name: '百炼剑骨', description: '矿石获得提高 25%，攻击成功率提高 8%', resource: { ore: 1.25 }, attackBonus: 0.08 },
  spirit: { name: '天灵根', description: '灵息获得提高 10%，修炼经验提高 20%', resource: { essence: 1.1 }, cultivationBonus: 0.2 }
};
const TECHNIQUES = {
  fortune: { name: '厚土载物诀', description: '每级提高自动与主动资源获取 4%', resourceBonus: 0.04 },
  qi: { name: '太虚纳气诀', description: '每级提高修炼经验 7%', cultivationBonus: 0.07 },
  war: { name: '玄锋战诀', description: '每级提高攻击成功率 3%，突破成功率 1%', attackBonus: 0.03, breakthroughBonus: 0.01 }
};
const MAX_TECHNIQUE_LEVEL = 5;
const BUILDINGS = {
  granary: { name: '灵谷仓', terrain: '平原', cost: [30, 20, 0, 0], gain: 4 },
  lumber: { name: '青木坊', terrain: '古林', cost: [20, 30, 0, 0], gain: 4 },
  mine: { name: '玄铁矿', terrain: '矿脉', cost: [20, 0, 25, 0], gain: 3 },
  altar: { name: '聚灵坛', terrain: '灵泉', cost: [30, 0, 0, 12], gain: 2 },
  relic: { name: '镇魂碑', terrain: '遗迹', cost: [25, 10, 0, 20], gain: 3 },
  fort: { name: '玄甲营', terrain: '平原', cost: [25, 20, 20, 0], gain: 0, defense: 0.2, skill: { name: '整军固守', cooldown: 300, shield: 180 } },
  market: { name: '灵市', terrain: '平原', cost: [20, 30, 10, 5], gain: 0, skill: { name: '灵市调运', cooldown: 180, cost: { wood: 10, ore: 5, essence: 2 }, reward: { grain: 42 } } },
  observatory: { name: '观星台', terrain: '平原', cost: [40, 20, 0, 18], gain: 0, eventRewardBonus: 0.08, skill: { name: '观星推演', cooldown: 360, cost: { grain: 12, essence: 6 }, reward: { cultivationExp: 180 } } },
  beastGarden: { name: '御兽苑', terrain: '平原', cost: [35, 15, 15, 8], gain: 0, attackBonus: 0.04, skill: { name: '灵兽巡猎', cooldown: 300, cost: { grain: 10, essence: 4 }, reward: { ore: 24, essence: 5 } } }
};
BUILDINGS.granary.skill = { name: '灵谷催熟', cooldown: 180, reward: { grain: 24 } };
BUILDINGS.lumber.skill = { name: '青木回春', cooldown: 180, reward: { wood: 24 } };
BUILDINGS.mine.skill = { name: '深层探脉', cooldown: 240, reward: { ore: 18 } };
BUILDINGS.altar.skill = { name: '聚灵入定', cooldown: 240, reward: { essence: 12, cultivationExp: 80 } };
BUILDINGS.relic.skill = { name: '镇魂回响', cooldown: 300, reward: { essence: 16, cultivationExp: 100 } };
const BUILDING_SPECIALIZATIONS = {
  prosperity: { name: '丰产专精', description: '自动产出提高 25%', outputMultiplier: 1.25 },
  mystic: { name: '灵技专精', description: '主动技能收益提高 30%', skillMultiplier: 1.3 },
  ward: { name: '镇守专精', description: '地块防御提高 15%，护盾技能持续时间提高 35%', defenseBonus: 0.15, shieldMultiplier: 1.35 }
};
const SPECIALIZATION_COST = { wood: 80, ore: 60, essence: 30 };
const OBSERVATORY_EVENT_BONUS_CAP = 0.4;
const BEAST_GARDEN_ATTACK_BONUS_CAP = 0.15;
const RAID_SHIELD_SECONDS = 45;
const ALLIANCE_PROJECTS = { road: { name: '通天商路', description: '每级提高全盟资源产出 10%', required: 120 }, academy: { name: '共修道场', description: '每级提高全盟修炼经验 15%', required: 150 }, hunt: { name: '猎界战旗', description: '每级提高全盟世界首领伤害 10%', required: 180 } };
const ALLIANCE_RELATION_TYPES = {
  ally: { name: '结盟', description: '双方互相保护，不能互相攻击或宣战' },
  truce: { name: '停战', description: '双方暂时停止冲突，不能互相攻击或宣战' }
};
const WORLD_EVENTS = [
  { title: '灵潮初现', description: '天地灵气在附近汇聚，主动修炼经验暂时提高。参与一次可引导灵潮，获得修炼经验和灵息', payload: { cultivationBonus: 20, interaction: { label: '引导灵潮', reward: { cultivationExp: 120, essence: 3 } } } },
  { title: '丰年将至', description: '灵稻丰收，主动采集的粮食暂时提高。参与一次可组织收割，获得粮食和木材', payload: { grainBonus: 6, interaction: { label: '组织收割', reward: { grain: 35, wood: 18 } } } },
  { title: '矿脉显世', description: '大地深处矿脉显露，主动采集的矿石暂时提高。参与一次可勘探矿脉，获得矿石和灵息', payload: { oreBonus: 4, interaction: { label: '勘探矿脉', reward: { ore: 28, essence: 5 } } } },
  { title: '古林回春', description: '古林灵木重新生长，主动采集的木材暂时提高。参与一次可培育灵种，获得木材和修炼经验', payload: { woodBonus: 4, interaction: { label: '培育灵种', reward: { wood: 30, cultivationExp: 90 } } } },
  { title: '月华照临', description: '月华落入灵泉，主动采集时会额外凝聚灵息。参与一次可承接月华，获得灵息和粮食', payload: { essenceBonus: 2, interaction: { label: '承接月华', reward: { essence: 10, grain: 24 } } } },
  { title: '群贤论道', description: '各方修士在邑城论道，主动修炼经验暂时提高。参与一次可旁听论道，获得大量修炼经验', payload: { cultivationBonus: 45, interaction: { label: '旁听论道', reward: { cultivationExp: 180, essence: 2 } } } },
  { title: '兽潮来袭', description: '兽潮正在逼近邑城，需要至少五位修士共同守城。参与守城可获得奖励，完成协作目标的最后一人还会得到额外战功', payload: { participantGoal: 5, interaction: { label: '协力守城', reward: { ore: 18, essence: 4, cultivationExp: 80 }, completionReward: { grain: 80, wood: 50, cultivationExp: 180 } } } },
  { title: '天灾预兆', description: '天灾将要降临，修士可以选择献出粮食赈济凡人，或消耗矿石与灵息炼制护符。每人只能选择一条道路', payload: { choices: [{ key: 'relief', label: '献粮赈灾', cost: { grain: 35 }, reward: { essence: 18, cultivationExp: 100 } }, { key: 'talisman', label: '炼制护符', cost: { ore: 20, essence: 8 }, reward: { wood: 55, cultivationExp: 145 } }] } },
  { title: '古阵开启', description: '沉睡在遗迹深处的古阵重新运转，修士可以稳步收集阵纹，或冒险强行引动阵眼。每人只能选择一条道路', payload: { choices: [{ key: 'inscribe', label: '收集阵纹', cost: { wood: 18 }, reward: { ore: 30, essence: 8, cultivationExp: 110 } }, { key: 'overload', label: '强引阵眼', cost: { ore: 28, essence: 10 }, reward: { grain: 70, cultivationExp: 230 } }] } },
  { title: '天门论道', description: '天门投下问道金光，需要三位修士共同参悟。每位参与者都能获得修炼收益，最后一位完成论道者还会得到额外战功', payload: { participantGoal: 3, interaction: { label: '参与论道', reward: { essence: 6, cultivationExp: 150 }, completionReward: { grain: 50, wood: 40, cultivationExp: 260 } } } },
  { title: '灵兽认主', description: '一只受伤的灵兽在邑城外徘徊，修士可以供养它恢复元气，或以灵息签订战契。每人只能选择一条道路', payload: { choices: [{ key: 'feed', label: '供养灵兽', cost: { grain: 45 }, reward: { wood: 45, cultivationExp: 120 } }, { key: 'contract', label: '签订战契', cost: { essence: 14 }, reward: { ore: 42, cultivationExp: 190 } }] } },
  { title: '灵脉迁徙', description: '一条地下灵脉正在缓慢迁徙，修士可以追踪灵脉收集逸散矿精，或稳固阵眼让灵息在邑城停留。每人只能选择一条道路', payload: { choices: [{ key: 'track', label: '追踪矿精', cost: { ore: 16 }, reward: { grain: 50, cultivationExp: 150 } }, { key: 'stabilize', label: '稳固阵眼', cost: { wood: 24, essence: 6 }, reward: { essence: 18, cultivationExp: 210 } }] } },
  { title: '天材地宝', description: '秘境中同时出现一株凝神灵草与一片灵果林，修士只能选择一处采集，带回的资源会影响后续修炼安排。每人只能选择一条道路', payload: { choices: [{ key: 'herb', label: '采集凝神灵草', cost: { essence: 5 }, reward: { ore: 22, cultivationExp: 230 } }, { key: 'fruit', label: '收取灵果', cost: { grain: 28 }, reward: { wood: 38, cultivationExp: 160 } }] } }
];
const DAILY_QUESTS = [
  { key: 'gather', name: '勤修采集', description: '今天主动采集 5 次', action: 'gather', goal: 5, reward: { grain: 50, wood: 30, cultivationExp: 80 } },
  { key: 'cultivate', name: '静心修炼', description: '今天主动修炼 2 次', action: 'cultivate', goal: 2, reward: { essence: 10, cultivationExp: 150 } },
  { key: 'claim', name: '开疆拓土', description: '今天圈占 1 块新地', action: 'claim', goal: 1, reward: { grain: 80, wood: 60, cultivationExp: 100 } },
  { key: 'build', name: '百工并作', description: '今天建造 1 座建筑', action: 'build', goal: 1, reward: { wood: 70, ore: 35, cultivationExp: 120 } },
  { key: 'explore', name: '寻幽探秘', description: '今天探索 1 处遗迹', action: 'explore', goal: 1, reward: { ore: 50, essence: 12, cultivationExp: 160 } },
  { key: 'donate', name: '同道相助', description: '今天向其他玩家捐赠 1 次物资', action: 'donate', goal: 1, reward: { grain: 60, essence: 8, cultivationExp: 100 } },
  { key: 'event', name: '应天而行', description: '今天参与 1 次天地异动', action: 'event', goal: 1, reward: { grain: 55, ore: 25, cultivationExp: 130 } },
  { key: 'world-boss', name: '共伐大荒', description: '今天攻击世界首领 1 次', action: 'world-boss', goal: 1, reward: { ore: 60, essence: 15, cultivationExp: 180 } }
];
const ACHIEVEMENTS = [
  { key: 'diligent', name: '勤修不辍', description: '完成 10 次修炼相关活动', goal: 10, reward: { cultivationExp: 240, essence: 12 }, progress: data => Number(data.activities.total || 0) },
  { key: 'bounty', name: '悬赏达人', description: '完成 3 项每日悬赏', goal: 3, reward: { grain: 120, wood: 80, cultivationExp: 180 }, progress: data => data.dailyQuests.filter(item => item.claimed).length },
  { key: 'relic-walker', name: '遗迹行者', description: '探索 3 处遗迹', goal: 3, reward: { ore: 100, essence: 20, cultivationExp: 220 }, progress: data => Number(data.activities.relics || 0) },
  { key: 'golden-core', name: '境界初成', description: '达到金丹大境界', goal: 4, reward: { essence: 30, cultivationExp: 500 }, progress: data => Number(data.player.stage || 0) },
  { key: 'fellowship', name: '同道相交', description: '加入一个联盟', goal: 1, reward: { essence: 18, cultivationExp: 160 }, progress: data => data.alliance ? 1 : 0 },
  { key: 'war-hero', name: '战争功臣', description: '所在联盟赢得 1 场战争', goal: 1, reward: { ore: 80, essence: 24, cultivationExp: 260 }, progress: data => data.wars.filter(item => item.settledAt && item.winnerAllianceId && item.winnerAllianceId === item.ownAllianceId).length },
  { key: 'steadfast', name: '守土有责', description: '成功守住领地 3 次', goal: 3, reward: { grain: 120, ore: 90, cultivationExp: 280 }, progress: data => Number(data.defenseWins || 0) },
  { key: 'technique-master', name: '功法大成', description: '将本命功法提升到 5 级', goal: 5, reward: { essence: 40, cultivationExp: 420 }, progress: data => Number(data.player.techniqueLevel || 0) },
  { key: 'trade-master', name: '交易行家', description: '完成 3 笔资源交易', goal: 3, reward: { grain: 90, wood: 90, cultivationExp: 220 }, progress: data => repo.actionCount(data.player.userName, 'trade-fill') },
  { key: 'benevolent', name: '济世扶危', description: '向其他玩家捐赠 5 次物资', goal: 5, reward: { grain: 120, essence: 18, cultivationExp: 240 }, progress: data => repo.actionCount(data.player.userName, 'donate') },
  { key: 'event-walker', name: '应天行者', description: '参与 3 次天地异动', goal: 3, reward: { ore: 70, essence: 18, cultivationExp: 240 }, progress: data => repo.actionCount(data.player.userName, 'event') },
  { key: 'event-adapter', name: '应变百策', description: '参与 5 次天地异动', goal: 5, reward: { essence: 28, cultivationExp: 360 }, progress: data => repo.actionCount(data.player.userName, 'event') },
  { key: 'alliance-builder', name: '共建联盟', description: '向联盟仓库捐赠 5 次物资', goal: 5, reward: { wood: 100, ore: 60, cultivationExp: 260 }, progress: data => repo.actionCount(data.player.userName, 'alliance-donate') },
  { key: 'season-champion', name: '魁首留名', description: '登上赛季双榜第一', goal: 1, reward: { grain: 260, wood: 260, ore: 260, essence: 60, cultivationExp: 520 }, progress: data => (data.season?.history || []).some(item => item.rankings?.[0]?.userName === data.player.userName || item.cultivationRankings?.[0]?.userName === data.player.userName) ? 1 : 0 },
  { key: 'world-hunter', name: '世界猎手', description: '参与 5 次世界首领围猎', goal: 5, reward: { ore: 140, essence: 30, cultivationExp: 360 }, progress: data => repo.actionCount(data.player.userName, 'world-boss') },
  { key: 'pioneer', name: '开疆先锋', description: '成功圈占 10 块新地', goal: 10, reward: { grain: 180, wood: 120, cultivationExp: 300 }, progress: data => repo.actionCount(data.player.userName, 'claim') },
  { key: 'architect', name: '百工大师', description: '建成 5 座功能建筑', goal: 5, reward: { wood: 140, ore: 90, cultivationExp: 320 }, progress: data => repo.actionCount(data.player.userName, 'build') }
];
const AUTO_TICK_SECONDS = 120;
const SEASON_SECONDS = 7 * 86400;
const GAIN_KEYS = ['grain','wood','ore','essence'];
const WAR_REWARD = { grain: 180, wood: 120, ore: 90, essence: 45 };
const WAR_PERSONAL_REWARDS = [
  { grain: 100, essence: 20, cultivationExp: 300 },
  { grain: 60, essence: 12, cultivationExp: 200 },
  { grain: 40, essence: 8, cultivationExp: 120 }
];
const WORLD_BOSS_CYCLE_SECONDS = 60 * 60;
const WORLD_BOSS_DURATION_SECONDS = 45 * 60;
const WORLD_BOSS_TEMPLATES = [
  { kind: 'beast', name: '九幽镇界兽', description: '九幽裂隙中爬出的镇界凶兽，血量低于 60% 后进入狂怒，低于 30% 后进入末路狂暴', maxHp: 12000, phases: [{ threshold: 0.6, name: '狂怒', damageMultiplier: 0.85 }, { threshold: 0.3, name: '末路狂暴', damageMultiplier: 0.7 }] },
  { kind: 'phoenix', name: '赤炎涅槃凰', description: '焚天火羽凝成的古凰，血量低于 50% 后进入涅槃火域，承受伤害大幅降低', maxHp: 10500, phases: [{ threshold: 0.5, name: '涅槃火域', damageMultiplier: 0.72 }] },
  { kind: 'tortoise', name: '太古玄岳龟', description: '背负山岳的玄龟，血量低于 70% 后收拢龟甲，低于 35% 后只露出破绽', maxHp: 16000, phases: [{ threshold: 0.7, name: '玄甲收拢', damageMultiplier: 0.8 }, { threshold: 0.35, name: '山岳破绽', damageMultiplier: 0.95 }] }
];
const WORLD_BOSS_PERSONAL_REWARDS = [
  { grain: 260, wood: 180, essence: 50, cultivationExp: 520 },
  { grain: 190, wood: 130, essence: 36, cultivationExp: 360 },
  { grain: 130, wood: 90, essence: 25, cultivationExp: 240 },
  { grain: 90, wood: 60, essence: 16, cultivationExp: 160 },
  { grain: 55, wood: 36, essence: 10, cultivationExp: 100 }
];
const WORLD_BOSS_ALLIANCE_REWARDS = [
  { grain: 600, wood: 400, ore: 250, essence: 120 },
  { grain: 420, wood: 280, ore: 160, essence: 80 },
  { grain: 280, wood: 180, ore: 100, essence: 50 }
];

function techniqueUpgradeCost(currentLevel) {
  // 按目标功法等级计算统一升级费用，供扣费和总览展示共用
  const level = Number(currentLevel || 0) + 1;
  return { level, cultivationExp: 300 * level, essence: 10 * level };
}

function buildingUpgradeCost(currentLevel) {
  // 按当前等级计算下一次建筑升级费用，供扣费和展示共用
  const level = Math.max(1, Number(currentLevel) || 1);
  return { level: level + 1, wood: 25 * level, ore: Math.floor(12.5 * level) };
}

function applyReward(data, reward) {
  // 应用事件或探索奖励允许的资源字段
  for (const key of [...GAIN_KEYS, 'cultivationExp']) data[key] += Number(reward?.[key] || 0);
}

function eventRewardMultiplier(userName) {
  // 观星台按等级强化天地异动奖励，奖励计算集中在服务端避免前端伪造
  const observatories = repo.ownedTiles(userName).filter(item => item.building === 'observatory');
  const bonusPerLevel = Number(BUILDINGS.observatory.eventRewardBonus || 0);
  const bonus = observatories.reduce((sum, item) => sum + Math.max(1, Number(item.level || 1)) * bonusPerLevel, 0);
  return 1 + Math.min(OBSERVATORY_EVENT_BONUS_CAP, bonus);
}

function scaleEventReward(reward, multiplier) {
  // 只放大事件奖励，不改变事件消耗和固定参与人数规则
  return Object.fromEntries(Object.entries(reward || {}).map(([key, value]) => [key, Math.floor(Number(value || 0) * multiplier)]));
}

function territoryAttackBonus(userName) {
  // 御兽苑按等级提供攻击成功率，封顶后仍保留其他灵根和功法的价值
  const bonusPerLevel = Number(BUILDINGS.beastGarden.attackBonus || 0);
  const bonus = repo.ownedTiles(userName).filter(item => item.building === 'beastGarden').reduce((sum, item) => sum + Math.max(1, Number(item.level || 1)) * bonusPerLevel, 0);
  return Math.min(BEAST_GARDEN_ATTACK_BONUS_CAP, bonus);
}

function attackChanceFor(data, target, userName, territoryBonus = territoryAttackBonus(userName)) {
  // 统一计算攻城成功率，供出手结算和地图预览共用
  if (!data || !target || !target.owner || target.owner === userName) return null;
  const defenseBonus = (BUILDINGS[target.building]?.defense || 0) + (BUILDING_SPECIALIZATIONS[target.specialization]?.defenseBonus || 0);
  const attackBonus = (TALENTS[data.talent]?.attackBonus || 0) + (TECHNIQUES[data.technique]?.attackBonus || 0) * (data.techniqueLevel || 0) + territoryBonus;
  return Math.min(100, Math.max(15, 58 + attackBonus * 100 - Number(target.level || 0) * 5 - defenseBonus * 100));
}

function worldBossPersonalReward(rank) {
  // 根据最终伤害排名计算世界首领个人奖励，保证战报刷新后仍可复现
  const extra = WORLD_BOSS_PERSONAL_REWARDS[rank - 1] || {};
  return { ...extra, cultivationExp: 80 + Number(extra.cultivationExp || 0) };
}

function dailyQuestDayNumber() {
  // 将上海本地日期转换为每日任务轮换编号
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {}); return Number(parts.year + parts.month + parts.day);
}

function dailyQuests(userName) {
  // 根据世界种子和本地日期轮换五个每日悬赏
  const offset = hash(0, dailyQuestDayNumber(), repo.world().seed) % DAILY_QUESTS.length; return Array.from({ length: 5 }, (_, index) => DAILY_QUESTS[(offset + index) % DAILY_QUESTS.length]).map(quest => ({ ...quest, progress: Math.min(quest.goal, repo.dailyActionCount(userName, quest.action)), claimed: repo.dailyQuestClaimed(userName, quest.key) }));
}

function breakthroughRequirements(stage) {
  // 根据大境界计算下一次突破所需材料
  const activityRequired = 5 + stage * 2; return { cultivationExp: 1000 * (stage + 1) ** 2, essence: 20 + stage * 8, meals: Math.ceil(activityRequired / 2), posts: Math.floor(activityRequired / 2), relics: Math.floor(stage / 3) };
}

function breakthroughChance(data) {
  // 返回当前玩家下一次大境界突破的实际成功率
  return Math.min(95, 55 + data.stage * 2 + (TECHNIQUES[data.technique]?.breakthroughBonus || 0) * (data.techniqueLevel || 0) * 100);
}

function talentResourceMultiplier(data, resource) {
  // 返回玩家灵根对指定资源的被动倍率
  return TALENTS[data.talent]?.resource?.[resource] || 1;
}

function techniqueResourceMultiplier(data) {
  // 返回玩家功法对资源获取的被动倍率
  const technique = TECHNIQUES[data.technique]; return 1 + (technique?.resourceBonus || 0) * (data.techniqueLevel || 0);
}

function techniqueCultivationMultiplier(data) {
  // 返回玩家功法对修炼经验的被动倍率
  const technique = TECHNIQUES[data.technique]; return 1 + (technique?.cultivationBonus || 0) * (data.techniqueLevel || 0);
}

function chooseTalent(userName, talent) {
  // 保存玩家首次觉醒的灵根路线
  const plan = TALENTS[talent]; const data = ensurePlayer(userName); if (!plan) fail(400, 'REALM_TALENT_INVALID', '灵根路线不存在'); if (data.talent) fail(409, 'REALM_TALENT_CHOSEN', '你已经完成灵根觉醒'); transaction(() => { if (!repo.setTalent(userName, talent)) fail(409, 'REALM_TALENT_CONFLICT', '灵根觉醒已经被其他操作完成'); repo.logAction({ actor: userName, action: 'talent', result: talent }); }); return overview(userName);
}

function learnTechnique(userName, technique) {
  // 保存玩家首次选择的功法
  const plan = TECHNIQUES[technique]; const data = ensurePlayer(userName); if (!plan) fail(400, 'REALM_TECHNIQUE_INVALID', '功法不存在'); if (data.technique) fail(409, 'REALM_TECHNIQUE_LEARNED', '你已经修习了其他功法'); transaction(() => { if (!repo.setTechnique(userName, technique)) fail(409, 'REALM_TECHNIQUE_CONFLICT', '功法选择已经被其他操作完成'); repo.logAction({ actor: userName, action: 'technique-learn', result: technique }); }); return overview(userName);
}

function upgradeTechnique(userName) {
  // 在锁定事务内读取功法等级和资源并完成一次升级
  collect(userName); transaction(() => { const data = repo.player(userName); if (!data) fail(500, 'REALM_TECHNIQUE_PLAYER_MISSING', '功法修炼者状态不存在'); const currentLevel = data.techniqueLevel || 0; if (!data.technique || !TECHNIQUES[data.technique]) fail(400, 'REALM_TECHNIQUE_REQUIRED', '请先选择功法'); if (currentLevel >= MAX_TECHNIQUE_LEVEL) fail(400, 'REALM_TECHNIQUE_LIMIT', '功法已经修炼到当前上限'); const cost = techniqueUpgradeCost(currentLevel); if (data.cultivationExp < cost.cultivationExp || data.essence < cost.essence) fail(400, 'REALM_TECHNIQUE_COST', `功法升级到${cost.level}级需要 ${cost.cultivationExp} 修炼经验和 ${cost.essence} 灵息`); data.cultivationExp -= cost.cultivationExp; data.essence -= cost.essence; if (!repo.upgradeTechnique(userName, currentLevel)) fail(409, 'REALM_TECHNIQUE_CONFLICT', '功法升级已经被其他操作完成'); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'technique-upgrade', result: String(cost.level) }); }); return overview(userName);
}

function seasonReward(rank) {
  // 根据赛季名次生成可追踪的结算奖励
  const rewards = [
    { grain: 180, wood: 140, ore: 100, essence: 60, cultivationExp: 600 },
    { grain: 120, wood: 90, ore: 65, essence: 38, cultivationExp: 380 },
    { grain: 80, wood: 60, ore: 42, essence: 24, cultivationExp: 220 }
  ]; return rewards[rank] || null;
}

function cultivationSeasonReward(rank) {
  // 为修炼榜前三名提供独立的境界成长奖励
  const rewards = [
    { essence: 70, cultivationExp: 700 },
    { essence: 45, cultivationExp: 480 },
    { essence: 30, cultivationExp: 300 }
  ]; return rewards[rank] || null;
}

function settleSeason(rankings, cultivationRankings = []) {
  // 给领地榜和修炼榜前三名分别发放一次性奖励
  rankings.slice(0, 3).forEach((item, index) => {
    const reward = seasonReward(index); const player = repo.player(item.userName);
    if (!player) fail(500, 'REALM_SEASON_PLAYER_MISSING', '赛季结算时找不到获奖玩家');
    applyReward(player, reward); repo.savePlayer(player);
  });
  cultivationRankings.slice(0, 3).forEach((item, index) => {
    const reward = cultivationSeasonReward(index); const player = repo.player(item.userName);
    if (!player) fail(500, 'REALM_SEASON_PLAYER_MISSING', '赛季结算时找不到获奖玩家');
    applyReward(player, reward); repo.savePlayer(player);
  });
  return { rankings, cultivationRankings };
}

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

function sqlTimeValue(text) {
  // 同时解析数据库本地时间和带时区的 ISO 时间，避免重复追加时区导致 Invalid Date
  if (text === null || text === undefined || text === '') return 0;
  if (typeof text === 'number') return Number.isFinite(text) ? text : 0;
  const value = String(text).trim();
  const parsed = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? new Date(value).getTime() : new Date(value.replace(' ', 'T') + '+08:00').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function coordinates(q, r) {
  // 校验并转换所有地图操作使用的轴向坐标
  const targetQ = Number(q); const targetR = Number(r); if (!Number.isSafeInteger(targetQ) || !Number.isSafeInteger(targetR)) fail(400, 'REALM_COORDINATE_INVALID', '地图坐标必须是整数'); return { q: targetQ, r: targetR };
}

function worldEvent(seed, cycle) {
  // 从世界事件池中按世界种子和时间周期挑选事件模板
  return WORLD_EVENTS[Math.abs(seed + cycle) % WORLD_EVENTS.length];
}

function ensureWorldEvent() {
  // 在事务内补充当前周期的唯一世界事件
  let events = repo.activeEvents(); if (events.length) return events;
  transaction(() => {
    events = repo.activeEvents(); if (events.length) return;
    const now = new Date(); const ends = new Date(now.getTime() + 30 * 60 * 1000); const cycle = Math.floor(now.getTime() / (30 * 60 * 1000)); const world = repo.world();
    const q = hash(cycle, 17, world.seed) % 25 - 12; const r = hash(cycle, 23, world.seed) % 25 - 12; const event = worldEvent(world.seed, cycle);
    repo.insertEvent({ kind: 'world', ...event, description: event.description + '（异动坐标 ' + q + ',' + r + '）', q, r, startsAt: localSqlTime(now), endsAt: localSqlTime(ends) });
  });
  return repo.activeEvents();
}

function ensureWorldBoss() {
  // 按整点周期生成全服共享的世界首领，并保留十五分钟准备间隔
  let boss = repo.activeWorldBoss(); if (boss) return boss;
  const now = Date.now(); let cycle = Math.floor(now / (WORLD_BOSS_CYCLE_SECONDS * 1000)); let startsAt = new Date(cycle * WORLD_BOSS_CYCLE_SECONDS * 1000); let endsAt = new Date(startsAt.getTime() + WORLD_BOSS_DURATION_SECONDS * 1000); if (now >= endsAt.getTime()) { cycle += 1; startsAt = new Date(cycle * WORLD_BOSS_CYCLE_SECONDS * 1000); endsAt = new Date(startsAt.getTime() + WORLD_BOSS_DURATION_SECONDS * 1000); } const world = repo.world();
  if (!repo.worldBossByCycle(cycle)) { const template = WORLD_BOSS_TEMPLATES[cycle % WORLD_BOSS_TEMPLATES.length]; const q = hash(1, cycle, world.seed) % 41 - 20; const r = hash(2, cycle, world.seed) % 41 - 20; transaction(() => { if (!repo.worldBossByCycle(cycle)) repo.insertWorldBoss({ cycle, kind: template.kind, name: template.name, description: template.description, maxHp: template.maxHp + world.epoch * 500, startsAt: localSqlTime(startsAt), endsAt: localSqlTime(endsAt), q, r }); }); }
  return repo.activeWorldBoss();
}

function worldBossTemplate(boss) {
  // 根据首领类型读取其阶段规则
  return WORLD_BOSS_TEMPLATES.find(item => item.kind === boss.kind) || WORLD_BOSS_TEMPLATES[0];
}

function worldBossPhase(boss) {
  // 根据首领剩余血量确定当前阶段与伤害倍率
  const template = worldBossTemplate(boss); const ratio = boss.currentHp / boss.maxHp; const phase = template.phases.filter(item => ratio <= item.threshold).sort((left, right) => left.threshold - right.threshold)[0]; return phase || { name: '常态', damageMultiplier: 1 };
}

function worldBossView(userName) {
  // 组合世界首领血量、个人伤害和全服贡献榜
  const boss = ensureWorldBoss(); if (!boss) return null; const personal = repo.worldBossParticipant(boss.id, userName) || { userName, damage: 0, attacks: 0, lastAttackAt: 0, rewarded: 0 }; const personalRank = repo.worldBossParticipantRank(boss.id, userName); const personalReward = boss.defeatedAt && personal.rewarded && personalRank ? worldBossPersonalReward(personalRank) : null; return { ...boss, phase: worldBossPhase(boss), participantCount: repo.worldBossParticipantCount(boss.id), personal: { damage: personal.damage, attacks: personal.attacks, rank: personalRank, lastAttackAt: personal.lastAttackAt, rewarded: Boolean(personal.rewarded), reward: personalReward }, ranking: repo.worldBossRanking(boss.id).map((item, index) => ({ rank: index + 1, userName: item.userName, damage: item.damage, attacks: item.attacks, reward: boss.defeatedAt ? worldBossPersonalReward(index + 1) : null })), allianceRanking: repo.worldBossAllianceRanking(boss.id).map((item, index) => ({ rank: index + 1, allianceName: item.allianceName, damage: item.damage, members: item.members })), allianceRewards: repo.worldBossAllianceRewards(boss.id) };
}

function nextWorldBossStart() {
  // 返回当前首领场次结束后下一整点的生成时间
  const cycle = Math.floor(Date.now() / (WORLD_BOSS_CYCLE_SECONDS * 1000));
  return localSqlTime(new Date((cycle + 1) * WORLD_BOSS_CYCLE_SECONDS * 1000));
}

function settleWorldBoss(bossId) {
  // 世界首领击杀后按贡献排名一次性发放奖励
  const participants = repo.worldBossParticipants(bossId); const rewards = participants.map((item, index) => { const player = repo.player(item.userName); if (!player) fail(500, 'REALM_BOSS_PLAYER_MISSING', '首领结算时找不到参战玩家'); if (!repo.markWorldBossRewarded(bossId, item.userName)) return { ...item, rank: index + 1, reward: null }; const reward = worldBossPersonalReward(index + 1); applyReward(player, reward); repo.savePlayer(player); repo.logAction({ actor: item.userName, action: 'world-boss-reward', result: bossId + ':' + (index + 1) }); return { ...item, rank: index + 1, reward }; }); repo.worldBossAllianceRanking(bossId, 3).forEach((item, index) => { const alliance = repo.allianceByName(item.allianceName); repo.recordWorldBossAllianceReward({ bossId, allianceName: item.allianceName, allianceId: alliance?.id, rank: index + 1, reward: WORLD_BOSS_ALLIANCE_REWARDS[index] }); }); return rewards;
}

function attackWorldBoss(userName) {
  // 在锁定事务内读取玩家和首领并结算一次围猎
  collect(userName); const previewBoss = ensureWorldBoss(); if (!previewBoss) fail(404, 'REALM_WORLD_BOSS_NONE', '当前没有正在出现的世界首领'); const now = Date.now(); let damage = 0; let defeated = false; let rewardRanking = null; transaction(() => { const boss = repo.worldBoss(previewBoss.id); const data = repo.player(userName); if (!boss || boss.defeatedAt) fail(409, 'REALM_WORLD_BOSS_DEFEATED', '这只世界首领已经被击败'); if (!data) fail(500, 'REALM_WORLD_BOSS_PLAYER_MISSING', '首领参战玩家状态不存在'); const participant = repo.worldBossParticipant(boss.id, userName); if (participant && participant.lastAttackAt + 20000 > now) fail(429, 'REALM_WORLD_BOSS_COOLDOWN', '首领攻击冷却中，请稍后再试'); if (data.ore < 20 || data.essence < 3) fail(400, 'REALM_WORLD_BOSS_COST', '攻击世界首领需要 20 矿石和 3 灵息'); const alliance = repo.alliance(userName); const baseDamage = 40 + data.stage * 18 + data.phase * 6 + Math.floor((TECHNIQUES[data.technique]?.attackBonus || 0) * 100 * (data.techniqueLevel || 0)); damage = Math.min(boss.currentHp, Math.floor(baseDamage * (1 + allianceBonus(alliance, 'hunt')) * worldBossPhase(boss).damageMultiplier)); data.ore -= 20; data.essence -= 3; repo.savePlayer(data); if (!repo.addWorldBossDamage({ bossId: boss.id, userName, allianceName: alliance?.name, damage, now })) fail(409, 'REALM_WORLD_BOSS_ENDED', '世界首领已经结束'); const after = repo.worldBoss(boss.id); if (after.currentHp <= 0 && repo.defeatWorldBoss(boss.id)) { defeated = true; rewardRanking = settleWorldBoss(boss.id); } repo.logAction({ actor: userName, action: 'world-boss', result: String(damage) }); }); const personalReward = defeated ? rewardRanking?.find(item => item.userName === userName) || null : null; return { ...overview(userName), bossDamage: damage, bossDefeated: defeated, bossRanking: rewardRanking, bossPersonalRank: personalReward?.rank || null, bossPersonalReward: personalReward?.reward || null, message: defeated ? '世界首领已被击败，参战奖励已经发放' : '攻击命中世界首领，伤害已经计入全服战果' };
}

function claimWorldBossAllianceRewards(userName) {
  // 将联盟尚未入仓的世界首领奖励一次性领取到联盟仓库
  const alliance = repo.alliance(userName); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '请先加入联盟'); const pending = repo.pendingWorldBossAllianceRewards(alliance.name); if (!pending.length) fail(404, 'REALM_BOSS_REWARD_NONE', '当前没有待领取的首领奖励'); let claimed = 0; transaction(() => { pending.forEach(item => { if (!repo.deliverWorldBossAllianceReward({ bossId: item.bossId, allianceName: alliance.name, allianceId: alliance.id, reward: item })) fail(409, 'REALM_BOSS_REWARD_CONFLICT', '首领奖励已经被其他成员领取或联盟状态已变化'); claimed += 1; }); repo.logAction({ actor: userName, action: 'world-boss-alliance-reward', result: String(claimed) }); }); return { ...overview(userName), claimedRewards: claimed, message: '首领奖励已存入联盟仓库' };
}

function settleExpiredWars() {
  // 首次访问到期战争时结算胜负并发放联盟仓库奖励
  for (const war of repo.expiredWars()) {
    const winner = war.attackerScore === war.defenderScore ? null : war.attackerScore > war.defenderScore ? war.attackerAllianceId : war.defenderAllianceId;
    transaction(() => { if (!repo.settleWar(war.id, winner)) return; if (!winner) return; repo.rewardAllianceWarehouse(winner, WAR_REWARD); const winnerAlliance = repo.allianceById(winner); if (winnerAlliance?.leader) repo.logAction({ actor: winnerAlliance.leader, action: 'war-warehouse-reward', result: 'war' + war.id }); repo.warParticipants(war.id, winner).forEach((item, index) => { const participant = repo.player(item.userName); if (!participant) fail(500, 'REALM_WAR_PLAYER_MISSING', '战争结算时找不到参战玩家'); applyReward(participant, WAR_PERSONAL_REWARDS[index]); repo.savePlayer(participant); repo.logAction({ actor: item.userName, action: 'war-reward', result: 'war' + war.id + ':' + (index + 1) }); }); });
  }
}

function settleExpiredTradeOrders() {
  // 首次访问交易所时关闭过期订单并退回托管资源
  const expired = repo.expiredTradeOrders(); if (!expired.length) return;
  [...new Set(expired.map(item => item.seller))].forEach(seller => collect(seller));
  transaction(() => { expired.forEach(order => { if (!repo.expireTradeOrder(order.id)) return; const seller = repo.player(order.seller); if (!seller) fail(500, 'REALM_TRADE_SELLER_MISSING', '交易退款时找不到卖方状态'); seller[order.offerResource] += order.offerAmount; repo.savePlayer(seller); repo.logAction({ actor: order.seller, action: 'trade-expire', result: String(order.id) }); }); });
}

function ensurePlayer(userName) {
  // 在写锁内复核玩家并分配互不重叠的出生点，避免首次进入并发冲突
  let current = repo.player(userName); if (current) return current;
  transaction(() => {
    if (repo.player(userName)) return;
    const index = Math.abs([...userName].reduce((sum, char) => sum + char.codePointAt(0), 0)); let homeQ = index % 9 - 4; let homeR = Math.floor(index / 9) % 9 - 4;
    while (repo.tile(homeQ, homeR)) { homeQ += 2; homeR -= 1; }
    repo.insertPlayer({ userName, homeQ, homeR }); repo.insertTile({ q: homeQ, r: homeR, terrain: '平原', owner: userName, building: 'town', level: 1 });
  });
  return repo.player(userName);
}

function ensureTiles(centerQ, centerR, radius) {
  // 在单个事务内生成当前视口范围内尚不存在的地块
  transaction(() => { const world = repo.world(); const items = []; for (let q = centerQ - radius; q <= centerQ + radius; q += 1) for (let r = centerR - radius; r <= centerR + radius; r += 1) if (distance(q, r, centerQ, centerR) <= radius) items.push({ q, r, terrain: terrain(q, r, world.seed) }); repo.insertTiles(items); });
}

function allianceBonus(alliance, kind) {
  // 读取联盟公共工程为成员提供的增益
  if (!alliance) return 0; const project = alliance.projects.find(item => item.projectKey === kind); const rates = { road: 0.1, academy: 0.15, hunt: 0.1 }; return project ? project.level * (rates[kind] || 0) : 0;
}

function productionPreview(userName, data) {
  // 根据当前建筑、地形、灵根、功法和联盟商路计算单个自动产出周期预估
  const rates = { grain: 3, wood: 2, ore: 0, essence: 0 };
  const resourceByBuilding = { granary: 'grain', lumber: 'wood', mine: 'ore', altar: 'essence', relic: 'essence' };
  for (const item of repo.ownedTiles(userName)) {
    const plan = BUILDINGS[item.building]; const resource = resourceByBuilding[item.building];
    if (!plan?.gain || !resource) continue;
    const ratio = item.terrain === plan.terrain ? 1.5 : 0.7;
    const specialization = BUILDING_SPECIALIZATIONS[item.specialization];
    rates[resource] += plan.gain * Math.max(1, item.level) * ratio * (specialization?.outputMultiplier || 1);
  }
  const boost = 1 + allianceBonus(repo.alliance(userName), 'road');
  return Object.fromEntries(GAIN_KEYS.map(key => [key, Math.floor(rates[key] * boost * talentResourceMultiplier(data, key) * techniqueResourceMultiplier(data))]));
}

function collect(userName) {
  // 在锁定事务内读取玩家并结算完整自动产出周期
  ensurePlayer(userName); const now = Date.now(); transaction(() => { const data = repo.player(userName); if (!data) fail(500, 'REALM_COLLECT_PLAYER_MISSING', '资源结算时找不到玩家状态'); const parsedLast = sqlTimeValue(data.lastCollectedAt); const last = parsedLast > 0 ? parsedLast : now; const elapsed = Math.max(0, Math.min(86400, (now - last) / 1000)); const ticks = Math.floor(elapsed / AUTO_TICK_SECONDS); if (ticks > 0) { const owned = repo.ownedTiles(userName); const alliance = repo.alliance(userName); const boost = 1 + allianceBonus(alliance, 'road'); const rates = { grain: 3, wood: 2, ore: 0, essence: 0 }; const resourceByBuilding = { granary: 'grain', lumber: 'wood', mine: 'ore', altar: 'essence', relic: 'essence' }; for (const item of owned) { const plan = BUILDINGS[item.building]; const resource = resourceByBuilding[item.building]; if (!plan?.gain || !resource) continue; const ratio = item.terrain === plan.terrain ? 1.5 : 0.7; const specialization = BUILDING_SPECIALIZATIONS[item.specialization]; rates[resource] += plan.gain * Math.max(1, item.level) * ratio * (specialization?.outputMultiplier || 1); } for (const key of GAIN_KEYS) data[key] += Math.floor(rates[key] * ticks * boost * talentResourceMultiplier(data, key) * techniqueResourceMultiplier(data)); data.cultivationExp += Math.floor(ticks * 2 * (1 + (TALENTS[data.talent]?.cultivationBonus || 0)) * techniqueCultivationMultiplier(data)); data.lastCollectedAt = localSqlTime(new Date(last + ticks * AUTO_TICK_SECONDS * 1000)); } else if (parsedLast <= 0) { data.lastCollectedAt = localSqlTime(new Date(now)); } repo.savePlayer(data); }); return repo.player(userName);
}

function gather(userName) {
  // 在锁定事务内读取事件和玩家并结算一次主动采集
  collect(userName); const now = Date.now(); let gatherReward = null; transaction(() => { const data = repo.player(userName); if (!data) fail(500, 'REALM_GATHER_PLAYER_MISSING', '采集者状态不存在'); const events = repo.activeEvents(userName); const grainBonus = events.reduce((sum, item) => sum + (item.payload.grainBonus || 0), 0); const woodBonus = events.reduce((sum, item) => sum + (item.payload.woodBonus || 0), 0); const oreBonus = events.reduce((sum, item) => sum + (item.payload.oreBonus || 0), 0); const essenceBonus = events.reduce((sum, item) => sum + (item.payload.essenceBonus || 0), 0); const techniqueMultiplier = techniqueResourceMultiplier(data); gatherReward = { grain: Math.floor((2 + grainBonus) * talentResourceMultiplier(data, 'grain') * techniqueMultiplier), wood: Math.floor((1 + woodBonus) * talentResourceMultiplier(data, 'wood') * techniqueMultiplier), ore: Math.floor((1 + oreBonus) * talentResourceMultiplier(data, 'ore') * techniqueMultiplier), essence: Math.floor((1 + essenceBonus) * talentResourceMultiplier(data, 'essence') * techniqueMultiplier) }; data.gatherReadyAt = now + 1000; if (!repo.reserveGather(userName, now)) fail(429, 'REALM_GATHER_COOLDOWN', '采集太快了，请稍后再点'); for (const key of GAIN_KEYS) data[key] += gatherReward[key]; repo.savePlayer(data); repo.logAction({ actor: userName, action: 'gather', result: JSON.stringify(gatherReward) }); }); return { ...overview(userName), gatherReward };
}

function overviewData(userName, q, r) {
  // 返回当前玩家状态、视口地块、活跃事件、排名和世界动态
  settleExpiredTradeOrders(); settleExpiredWars(); ensureSeason(); const data = collect(userName); repo.touchPresence(userName); const requestedQ = q === undefined || q === '' || q === null ? data.homeQ : Number(q); const requestedR = r === undefined || r === '' || r === null ? data.homeR : Number(r); if (!Number.isSafeInteger(requestedQ) || !Number.isSafeInteger(requestedR)) fail(400, 'REALM_COORDINATE_INVALID', '地图坐标必须是整数'); const centerQ = requestedQ; const centerR = requestedR; ensureTiles(centerQ, centerR, 4);
  const events = ensureWorldEvent().map(event => repo.activeEvent(event.id, userName));
  const alliance = repo.alliance(userName); const wars = repo.recentWars(userName).map(war => { const ownWin = war.settledAt && war.winnerAllianceId === war.ownAllianceId; const ownRewardIndex = ownWin ? (war.participants || []).findIndex(item => item.userName === userName) : -1; return { ...war, warehouseReward: ownWin ? WAR_REWARD : null, ownReward: ownRewardIndex >= 0 && WAR_PERSONAL_REWARDS[ownRewardIndex] ? { rank: ownRewardIndex + 1, reward: WAR_PERSONAL_REWARDS[ownRewardIndex] } : null }; }); const techniqueLevel = data.techniqueLevel || 0; const techniqueUpgrade = data.technique && techniqueLevel < MAX_TECHNIQUE_LEVEL ? techniqueUpgradeCost(techniqueLevel) : null; const breakthrough = { ...breakthroughRequirements(data.stage), chance: breakthroughChance(data), available: data.stage < STAGES.length - 1 }; const worldBoss = worldBossView(userName); return { serverTime: Date.now(), season: seasonInfo(), world: repo.world(), player: data, productionPerTick: productionPreview(userName, data), onlinePlayers: repo.onlinePlayers(), talents: Object.entries(TALENTS).map(([key, value]) => ({ key, name: value.name, description: value.description })), techniques: Object.entries(TECHNIQUES).map(([key, value]) => ({ key, name: value.name, description: value.description, maxLevel: MAX_TECHNIQUE_LEVEL })), techniqueUpgrade, alliance, allianceRelations: alliance ? repo.allianceRelations(alliance.id) : [], allianceRelationTypes: Object.entries(ALLIANCE_RELATION_TYPES).map(([key, value]) => ({ key, name: value.name, description: value.description })), allianceBossRewards: alliance ? repo.pendingWorldBossAllianceRewards(alliance.name) : [], wars, battleReports: repo.battleReports(userName), allianceProjects: Object.entries(ALLIANCE_PROJECTS).map(([key, value]) => ({ key, name: value.name, description: value.description, required: value.required })), worldBoss, worldBossNextAt: worldBoss ? null : nextWorldBossStart(), breakthrough, dailyQuests: dailyQuests(userName), tradeOrders: repo.openTradeOrders(), activities: { ...activity(userName), relics: repo.explorationCount(userName) }, ranking: repo.ranking(), cultivationRanking: repo.cultivationRanking(), actions: repo.recentActions(), stages: STAGES, phases: PHASES, specializations: Object.entries(BUILDING_SPECIALIZATIONS).map(([key, value]) => ({ key, name: value.name, description: value.description, cost: SPECIALIZATION_COST })), buildings: Object.entries(BUILDINGS).map(([key, value]) => ({ key, name: value.name, terrain: value.terrain, gain: value.gain, defense: value.defense || 0, eventRewardBonus: value.eventRewardBonus || 0, cost: Object.fromEntries(GAIN_KEYS.map((resource, index) => [resource, value.cost[index]]).filter(([, amount]) => amount > 0)), skill: value.skill ? { name: value.skill.name, cooldown: value.skill.cooldown, cost: value.skill.cost || {}, reward: value.skill.reward || {} } : null })), tiles: repo.tiles(centerQ - 4, centerQ + 4, centerR - 4, centerR + 4, userName), events };
}

function overview(userName, q, r) {
  // 由服务端统一计算功勋进度，避免前端复制成长规则
  const data = overviewData(userName, q, r);
  data.buildings = data.buildings.map(item => ({ ...item, attackBonus: BUILDINGS[item.key]?.attackBonus || 0 }));
  const eventMultiplier = eventRewardMultiplier(userName);
  data.worldEventBonus = Math.round((eventMultiplier - 1) * 100);
  data.events = data.events.map(event => ({ ...event, payload: { ...event.payload, choices: event.payload.choices?.map(choice => ({ ...choice, reward: scaleEventReward(choice.reward, eventMultiplier) })), interaction: event.payload.interaction ? { ...event.payload.interaction, reward: scaleEventReward(event.payload.interaction.reward, eventMultiplier), completionReward: event.payload.interaction.completionReward ? scaleEventReward(event.payload.interaction.completionReward, eventMultiplier) : event.payload.interaction.completionReward } : event.payload.interaction } }));
  const attacker = repo.player(userName);
  const territoryBonus = territoryAttackBonus(userName);
  data.tiles = data.tiles.map(tile => ({ ...tile, attackChance: attackChanceFor(attacker, tile, userName, territoryBonus) }));
  const defenseStats = repo.defenseStats(userName);
  data.defenseWins = defenseStats.wins;
  data.defenseLosses = defenseStats.losses;
  data.achievements = ACHIEVEMENTS.map(item => ({ key: item.key, name: item.name, description: item.description, goal: item.goal, progress: Math.min(item.goal, Math.max(0, item.progress(data))), completed: item.progress(data) >= item.goal, claimed: repo.achievementClaimed(userName, item.key), reward: item.reward }));
  return data;
}

function rankingInfo(userName) {
  // 返回排行榜专用数据，避免读取完整地图和世界侧栏
  settleExpiredTradeOrders(); settleExpiredWars(); ensureSeason(); collect(userName); return { serverTime: Date.now(), ranking: repo.ranking(), cultivationRanking: repo.cultivationRanking() };
}

function seasonInfo() {
  // 返回当前赛季状态并在到期时完成历史快照
  settleExpiredWars(); const current = ensureSeason(); const serverTime = Date.now(); const start = new Date(sqlTimeValue(current.createdAt)); const end = new Date(start.getTime() + SEASON_SECONDS * 1000); const remaining = Math.max(0, Math.floor((end.getTime() - serverTime) / 1000)); return { serverTime, number: current.epoch, startedAt: current.createdAt, endsAt: localSqlTime(end), remainingSeconds: remaining, history: repo.seasonHistory() };
}

function ensureSeason() {
  // 首次访问到期赛季时保存排名并原子开启下一赛季
  let current = repo.world(); if (!current) return current; if ((Date.now() - sqlTimeValue(current.createdAt)) / 1000 < SEASON_SECONDS) return current;
  transaction(() => { const latest = repo.world(); if ((Date.now() - sqlTimeValue(latest.createdAt)) / 1000 < SEASON_SECONDS) return; const endedAt = localSqlTime(new Date()); const startedAt = endedAt; const archivedRankings = repo.ranking(); const archivedCultivationRankings = repo.cultivationRanking(); const archived = repo.archiveSeason({ seasonNumber: latest.epoch, startedAt: latest.createdAt, endedAt, rankings: archivedRankings.map((item, index) => ({ ...item, seasonReward: seasonReward(index) })), cultivationRankings: archivedCultivationRankings.map((item, index) => ({ ...item, cultivationReward: cultivationSeasonReward(index) })) }); if (archived.changes === 1) settleSeason(archivedRankings, archivedCultivationRankings); repo.advanceSeason({ currentNumber: latest.epoch, nextNumber: latest.epoch + 1, startedAt }); }); current = repo.world(); return current;
}

function claim(userName, q, r) {
  // 在锁定事务内重新读取玩家和地块并完成原子圈地
  const targetCoordinate = coordinates(q, r); ensureTiles(targetCoordinate.q, targetCoordinate.r, 1); collect(userName); transaction(() => { const data = repo.player(userName); const target = repo.tile(targetCoordinate.q, targetCoordinate.r); if (!data) fail(500, 'REALM_CLAIM_PLAYER_MISSING', '圈地者状态不存在'); if (!target) fail(404, 'REALM_TILE_NOT_FOUND', '这块地还没有进入视野'); if (target.owner) fail(409, 'REALM_TILE_OWNED', '这块地已经有归属'); const nearby = repo.tiles(target.q - 1, target.q + 1, target.r - 1, target.r + 1).some(item => item.owner === userName && distance(item.q, item.r, target.q, target.r) === 1); if (!nearby) fail(400, 'REALM_TILE_NOT_ADJACENT', '只能从自己的领地向外扩张'); if (data.grain < 12 || data.wood < 8) fail(400, 'REALM_CLAIM_COST', '圈地需要 12 粮食和 8 木材'); data.grain -= 12; data.wood -= 8; if (!repo.claimTile(target.q, target.r, userName)) fail(409, 'REALM_TILE_CLAIM_CONFLICT', '这块地刚刚被其他玩家占领'); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'claim', q: target.q, r: target.r, result: 'success' }); }); return overview(userName, targetCoordinate.q, targetCoordinate.r);
}

function build(userName, q, r, building) {
  // 在自己的地块上按地形修建功能建筑
  const targetCoordinate = coordinates(q, r); const plan = BUILDINGS[building]; if (!plan) fail(400, 'REALM_BUILDING_INVALID', '建筑类型不存在'); collect(userName); transaction(() => { const target = repo.tile(targetCoordinate.q, targetCoordinate.r); const data = repo.player(userName); if (!data) fail(500, 'REALM_BUILD_PLAYER_MISSING', '建造者状态不存在'); if (!target || target.owner !== userName) fail(400, 'REALM_BUILD_OWNER', '只能在自己的地块上修建'); if (target.building) fail(409, 'REALM_BUILDING_EXISTS', '这块地已经有建筑'); if (target.terrain !== plan.terrain) fail(400, 'REALM_BUILDING_TERRAIN', plan.name + '只能修建在' + plan.terrain + '地块'); if (GAIN_KEYS.some((key, index) => data[key] < plan.cost[index])) fail(400, 'REALM_BUILD_COST', '现有资源不足以修建该建筑'); GAIN_KEYS.forEach((key, index) => { data[key] -= plan.cost[index]; }); if (!repo.buildTile(target.q, target.r, userName, building)) fail(409, 'REALM_BUILD_CONFLICT', '这块地刚刚完成了其他建筑操作'); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'build', q: target.q, r: target.r, result: building }); }); return overview(userName, targetCoordinate.q, targetCoordinate.r);
}

function demolish(userName, q, r) {
  // 在自己的地块上拆除功能建筑并返还一半基础建造材料
  const targetCoordinate = coordinates(q, r); collect(userName); let refund = null; let building = '';
  transaction(() => {
    const target = repo.tile(targetCoordinate.q, targetCoordinate.r); const data = repo.player(userName); const plan = target && BUILDINGS[target.building];
    if (!data) fail(500, 'REALM_DEMOLISH_PLAYER_MISSING', '拆除者状态不存在');
    if (!target || target.owner !== userName || !plan || target.building === 'town') fail(400, 'REALM_DEMOLISH_OWNER', '只能拆除自己的功能建筑');
    refund = Object.fromEntries(GAIN_KEYS.map((key, index) => [key, Math.floor(Number(plan.cost[index] || 0) * 0.5)]).filter(([, amount]) => amount > 0));
    for (const [key, amount] of Object.entries(refund)) data[key] += amount;
    building = plan.name;
    if (!repo.demolishTile(target.q, target.r, userName, target.building)) fail(409, 'REALM_DEMOLISH_CONFLICT', '这座建筑刚刚被其他操作拆除或更换');
    repo.savePlayer(data); repo.logAction({ actor: userName, action: 'demolish', q: target.q, r: target.r, result: target.building });
  });
  return { ...overview(userName, targetCoordinate.q, targetCoordinate.r), demolishRefund: refund, demolishedBuilding: building };
}

function upgrade(userName, q, r) {
  // 提升自己地块上建筑的等级并提高产出
  const targetCoordinate = coordinates(q, r); collect(userName); let nextLevel = 0; transaction(() => { const target = repo.tile(targetCoordinate.q, targetCoordinate.r); const data = repo.player(userName); if (!data) fail(500, 'REALM_UPGRADE_PLAYER_MISSING', '升级者状态不存在'); if (!target || target.owner !== userName || !target.building || target.building === 'town') fail(400, 'REALM_UPGRADE_OWNER', '只能升级自己的功能建筑'); const cost = buildingUpgradeCost(target.level); if (data.wood < cost.wood || data.ore < cost.ore) fail(400, 'REALM_UPGRADE_COST', '升级需要更多木材和矿石'); data.wood -= cost.wood; data.ore -= cost.ore; nextLevel = cost.level; if (!repo.upgradeTile(target.q, target.r, userName, target.level)) fail(409, 'REALM_UPGRADE_CONFLICT', '这座建筑刚刚被其他操作升级'); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'upgrade', q: target.q, r: target.r, result: 'level' + nextLevel }); }); return overview(userName, targetCoordinate.q, targetCoordinate.r);
}

function specializeBuilding(userName, q, r, specialization) {
  // 在锁定事务内读取建筑和材料并完成一次专精
  const targetCoordinate = coordinates(q, r); const plan = BUILDING_SPECIALIZATIONS[specialization]; if (!plan) fail(400, 'REALM_SPECIALIZATION_INVALID', '建筑专精类型不存在'); collect(userName); transaction(() => { const target = repo.tile(targetCoordinate.q, targetCoordinate.r); const data = repo.player(userName); if (!data) fail(500, 'REALM_SPECIALIZATION_PLAYER_MISSING', '专精选择者状态不存在'); if (!target || target.owner !== userName || !target.building || target.building === 'town') fail(400, 'REALM_SPECIALIZATION_OWNER', '只能为自己的功能建筑选择专精'); if (target.level < 3) fail(400, 'REALM_SPECIALIZATION_LEVEL', '建筑达到 3 级后才能选择专精'); if (target.specialization) fail(409, 'REALM_SPECIALIZATION_CHOSEN', '这座建筑已经选择过专精'); for (const [key, value] of Object.entries(SPECIALIZATION_COST)) if (data[key] < value) fail(400, 'REALM_SPECIALIZATION_COST', '选择建筑专精需要更多资源'); for (const [key, value] of Object.entries(SPECIALIZATION_COST)) data[key] -= value; if (!repo.specializeTile(target.q, target.r, userName, specialization)) fail(409, 'REALM_SPECIALIZATION_CONFLICT', '这座建筑刚刚被其他操作确定专精'); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'specialize', q: target.q, r: target.r, result: specialization }); }); return overview(userName, targetCoordinate.q, targetCoordinate.r);
}

function activateBuilding(userName, q, r) {
  // 在锁定事务内读取建筑和资源并结算一次主动技能
  const targetCoordinate = coordinates(q, r); collect(userName); const now = Date.now(); let reward = null; let cost = null; let skillName = ''; transaction(() => { const target = repo.tile(targetCoordinate.q, targetCoordinate.r); const data = repo.player(userName); const plan = target && BUILDINGS[target.building]; if (!data) fail(500, 'REALM_BUILDING_SKILL_PLAYER_MISSING', '技能使用者状态不存在'); if (!target || target.owner !== userName || !plan?.skill) fail(400, 'REALM_BUILDING_SKILL_INVALID', '这块地没有可用的建筑技能'); if (target.skillReadyAt > now) fail(429, 'REALM_BUILDING_SKILL_COOLDOWN', '建筑技能冷却中，请稍后再试'); cost = plan.skill.cost || {}; for (const key of GAIN_KEYS) if (data[key] < Number(cost[key] || 0)) fail(400, 'REALM_BUILDING_SKILL_COST', plan.name + '技能所需资源不足'); for (const key of GAIN_KEYS) data[key] -= Number(cost[key] || 0); const specialization = BUILDING_SPECIALIZATIONS[target.specialization]; const rewardMultiplier = specialization?.skillMultiplier || 1; reward = plan.skill.reward || {}; for (const key of [...GAIN_KEYS, 'cultivationExp']) data[key] += Math.floor(Number(reward[key] || 0) * Math.max(1, target.level) * rewardMultiplier); if (plan.skill.shield) { const shieldMultiplier = specialization?.shieldMultiplier || 1; data.shieldUntil = localSqlTime(new Date(Math.max(now + plan.skill.shield * 1000 * shieldMultiplier, sqlTimeValue(data.shieldUntil) || 0))); } const readyAt = now + plan.skill.cooldown * 1000; if (!repo.reserveBuildingSkill(target.q, target.r, userName, now, readyAt)) fail(409, 'REALM_BUILDING_SKILL_CONFLICT', '建筑技能刚刚被其他操作发动'); repo.savePlayer(data); skillName = plan.skill.name; repo.logAction({ actor: userName, action: 'building-skill', q: target.q, r: target.r, result: target.building }); }); return { ...overview(userName, targetCoordinate.q, targetCoordinate.r), skillReward: reward, skillCost: cost, skillName };
}

function donate(userName, recipient, amount, resource) {
  // 在锁定事务内读取双方状态并完成资源转移
  const resourceKey = resource || 'grain'; const value = Number(amount); const targetName = typeof recipient === 'string' ? recipient.trim() : ''; if (!GAIN_KEYS.includes(resourceKey)) fail(400, 'REALM_DONATE_RESOURCE', '捐赠资源类型无效'); if (!targetName || targetName === userName) fail(400, 'REALM_DONATE_RECIPIENT', '捐赠对象必须是另一位玩家'); if (!hasUser(targetName)) fail(404, 'REALM_DONATE_USER', '找不到这位玩家'); if (!Number.isSafeInteger(value) || value < 1) fail(400, 'REALM_DONATE_AMOUNT', '捐赠数量无效或余额不足'); collect(userName); ensurePlayer(targetName); transaction(() => { const sender = repo.player(userName); const target = repo.player(targetName); if (!sender || !target) fail(500, 'REALM_DONATE_PLAYER_MISSING', '捐赠双方玩家状态不存在'); if (sender[resourceKey] < value) fail(400, 'REALM_DONATE_AMOUNT', '捐赠数量无效或余额不足'); sender[resourceKey] -= value; target[resourceKey] += value; repo.savePlayer(sender); repo.savePlayer(target); repo.logAction({ actor: userName, action: 'donate', result: targetName + ':' + resourceKey + ':' + value }); }); return overview(userName);
}

function allianceDonate(userName, amount, resource) {
  // 在锁定事务内读取成员资格和资源并完成联盟捐赠
  const resourceKey = resource || 'grain'; const value = Number(amount); if (!GAIN_KEYS.includes(resourceKey)) fail(400, 'REALM_ALLIANCE_DONATE_RESOURCE', '捐赠资源类型无效'); if (!Number.isSafeInteger(value) || value < 1) fail(400, 'REALM_ALLIANCE_DONATE_AMOUNT', '捐赠数量无效或余额不足'); collect(userName); transaction(() => { const data = repo.player(userName); const alliance = repo.alliance(userName); if (!data) fail(500, 'REALM_ALLIANCE_DONATE_PLAYER_MISSING', '捐赠者状态不存在'); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '请先加入一个联盟'); if (data[resourceKey] < value) fail(400, 'REALM_ALLIANCE_DONATE_AMOUNT', '捐赠数量无效或余额不足'); data[resourceKey] -= value; const resources = { grain: 0, wood: 0, ore: 0, essence: 0 }; resources[resourceKey] = value; repo.savePlayer(data); repo.addAllianceResources({ allianceId: alliance.id, ...resources, contribution: value, userName }); repo.logAction({ actor: userName, action: 'alliance-donate', result: resourceKey + ':' + value }); }); return overview(userName);
}

function allianceProjectDonate(userName, projectKey, amount, source) {
  // 从个人或联盟仓库投入粮食推进公共工程
  const plan = ALLIANCE_PROJECTS[projectKey];
  if (!plan) fail(400, 'REALM_PROJECT_INVALID', '公共工程类型不存在');
  const value = Number(amount);
  const fundingSource = source || 'personal';
  if (!['personal', 'warehouse'].includes(fundingSource)) fail(400, 'REALM_PROJECT_DONATE_SOURCE', '工程投入来源无效');
  if (!Number.isSafeInteger(value) || value < 1) fail(400, 'REALM_PROJECT_DONATE_AMOUNT', '投入粮食数量无效或余额不足');
  collect(userName);
  let result;
  transaction(() => {
    const data = repo.player(userName);
    const alliance = repo.alliance(userName);
    if (!data) fail(500, 'REALM_PROJECT_DONATE_PLAYER_MISSING', '工程投入者状态不存在');
    if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '请先加入一个联盟');
    if (fundingSource === 'warehouse') {
      if (!repo.spendAllianceGrain(alliance.id, value)) fail(400, 'REALM_PROJECT_WAREHOUSE_BALANCE', '联盟仓库粮食不足');
    } else {
      if (data.grain < value) fail(400, 'REALM_PROJECT_DONATE_AMOUNT', '投入粮食数量无效或余额不足');
      data.grain -= value;
      repo.savePlayer(data);
      repo.addAllianceResources({ allianceId: alliance.id, grain: 0, wood: 0, ore: 0, essence: 0, contribution: value, userName });
    }
    result = repo.addAllianceProject({ allianceId: alliance.id, projectKey, progress: value, required: plan.required });
    repo.addAllianceProjectContribution({ allianceId: alliance.id, userName, projectKey, source: fundingSource, amount: value });
    repo.logAction({ actor: userName, action: 'project-donate', result: projectKey + ':' + value + ':' + fundingSource });
  });
  return { ...overview(userName), project: result };
}

function createTradeOrder(userName, offerResource, offerAmount, wantResource, wantAmount) {
  // 在锁定事务内读取卖方状态并完成资源托管
  const offer = typeof offerResource === 'string' ? offerResource : ''; const want = typeof wantResource === 'string' ? wantResource : ''; const offered = Number(offerAmount); const wanted = Number(wantAmount); if (!GAIN_KEYS.includes(offer) || !GAIN_KEYS.includes(want) || offer === want) fail(400, 'REALM_TRADE_RESOURCE', '交易资源类型无效或不能相同'); if (!Number.isSafeInteger(offered) || offered < 1 || !Number.isSafeInteger(wanted) || wanted < 1) fail(400, 'REALM_TRADE_AMOUNT', '交易数量必须是正整数'); settleExpiredTradeOrders(); collect(userName); transaction(() => { const data = repo.player(userName); if (!data) fail(500, 'REALM_TRADE_PLAYER_MISSING', '交易卖方玩家状态不存在'); if (data[offer] < offered) fail(400, 'REALM_TRADE_BALANCE', '挂单资源余额不足'); data[offer] -= offered; if (!repo.insertTradeOrder({ seller: userName, offerResource: offer, offerAmount: offered, wantResource: want, wantAmount: wanted, expiresAt: localSqlTime(new Date(Date.now() + 24 * 60 * 60 * 1000)) })) fail(409, 'REALM_TRADE_CONFLICT', '交易订单创建失败'); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'trade-create', result: offer + ':' + offered + '>' + want + ':' + wanted }); }); return overview(userName);
}

function fillTradeOrder(userName, orderId) {
  // 在锁定事务内重新读取双方状态并完成原子资源交换
  settleExpiredTradeOrders(); const previewBuyer = collect(userName); const previewOrder = repo.tradeOrder(Number(orderId)); if (!previewOrder || previewOrder.status !== 'open') fail(404, 'REALM_TRADE_NOT_FOUND', '交易订单不存在或已经结束'); if (previewOrder.seller === userName) fail(400, 'REALM_TRADE_SELF', '不能成交自己的交易订单'); if (previewBuyer[previewOrder.wantResource] < previewOrder.wantAmount) fail(400, 'REALM_TRADE_BALANCE', '成交所需资源不足'); collect(previewOrder.seller); transaction(() => { const order = repo.tradeOrder(Number(orderId)); if (!order || order.status !== 'open') fail(409, 'REALM_TRADE_CONFLICT', '交易订单已经被其他玩家成交'); if (order.seller === userName) fail(400, 'REALM_TRADE_SELF', '不能成交自己的交易订单'); const buyer = repo.player(userName); const seller = repo.player(order.seller); if (!buyer || !seller) fail(500, 'REALM_TRADE_PLAYER_MISSING', '交易双方玩家状态不存在'); if (buyer[order.wantResource] < order.wantAmount) fail(400, 'REALM_TRADE_BALANCE', '成交所需资源不足'); buyer[order.wantResource] -= order.wantAmount; buyer[order.offerResource] += order.offerAmount; seller[order.wantResource] += order.wantAmount; if (!repo.claimTradeOrder(order.id, userName)) fail(409, 'REALM_TRADE_CONFLICT', '交易订单已经被其他玩家成交'); repo.savePlayer(buyer); repo.savePlayer(seller); repo.logAction({ actor: userName, action: 'trade-fill', result: String(order.id) }); }); return overview(userName);
}

function cancelTradeOrder(userName, orderId) {
  // 在锁定事务内重新读取卖方状态并退回托管资源
  settleExpiredTradeOrders(); collect(userName); const previewOrder = repo.tradeOrder(Number(orderId)); if (!previewOrder || previewOrder.status !== 'open' || previewOrder.seller !== userName) fail(404, 'REALM_TRADE_NOT_FOUND', '只能取消自己的未成交订单'); transaction(() => { const order = repo.tradeOrder(Number(orderId)); if (!order || order.status !== 'open' || order.seller !== userName) fail(409, 'REALM_TRADE_CONFLICT', '交易订单已经被其他玩家处理'); const data = repo.player(userName); if (!data) fail(500, 'REALM_TRADE_PLAYER_MISSING', '交易卖方玩家状态不存在'); data[order.offerResource] += order.offerAmount; if (!repo.cancelTradeOrder(order.id, userName)) fail(409, 'REALM_TRADE_CONFLICT', '交易订单已经被其他玩家处理'); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'trade-cancel', result: String(order.id) }); }); return overview(userName);
}

function proposeAllianceRelation(userName, targetName, kind) {
  // 由盟主向其他联盟发起结盟或停战申请
  const relationType = ALLIANCE_RELATION_TYPES[kind]; const alliance = repo.alliance(userName); if (!relationType) fail(400, 'REALM_RELATION_KIND', '外交关系类型不存在'); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '请先加入联盟'); if (alliance.leader !== userName) fail(403, 'REALM_RELATION_LEADER_ONLY', '只有盟主可以发起外交申请'); const target = repo.allianceByName(typeof targetName === 'string' ? targetName.trim() : ''); if (!target) fail(404, 'REALM_RELATION_TARGET', '找不到目标联盟'); if (target.id === alliance.id) fail(400, 'REALM_RELATION_SELF', '不能与自己的联盟建立外交关系'); if (repo.warBetween(alliance.id, target.id)) fail(409, 'REALM_RELATION_WAR', '战争期间不能发起外交申请'); const existing = repo.allianceRelations(alliance.id).find(item => item.targetAllianceId === target.id); if (existing && ['pending', 'active'].includes(existing.status)) fail(409, 'REALM_RELATION_EXISTS', '两个联盟之间已有待处理或生效的外交关系'); transaction(() => { if (!repo.upsertAllianceRelation({ allianceAId: alliance.id, allianceBId: target.id, kind, proposerAllianceId: alliance.id })) fail(409, 'REALM_RELATION_CONFLICT', '外交申请状态发生变化'); repo.logAction({ actor: userName, action: 'alliance-relation', result: relationType.name + ':' + alliance.name + '>' + target.name }); }); return overview(userName);
}

function respondAllianceRelation(userName, relationId, accept) {
  // 由目标盟主接受或拒绝外交申请
  const alliance = repo.alliance(userName); const relation = repo.allianceRelationById(Number(relationId)); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '请先加入联盟'); if (alliance.leader !== userName) fail(403, 'REALM_RELATION_LEADER_ONLY', '只有盟主可以处理外交申请'); if (!relation || relation.status !== 'pending' || relation.proposerAllianceId === alliance.id || ![relation.allianceAId, relation.allianceBId].includes(alliance.id)) fail(404, 'REALM_RELATION_NOT_FOUND', '这项外交申请不存在或已经处理'); const status = accept === true ? 'active' : 'declined'; transaction(() => { if (!repo.respondAllianceRelation({ allianceAId: relation.allianceAId, allianceBId: relation.allianceBId, status })) fail(409, 'REALM_RELATION_CONFLICT', '外交申请已经被其他操作处理'); repo.logAction({ actor: userName, action: 'alliance-relation', result: status + ':' + relation.kind }); }); return overview(userName);
}

function endAllianceRelation(userName, relationId) {
  // 由任一盟主结束已经生效的外交关系
  const alliance = repo.alliance(userName); const relation = repo.allianceRelationById(Number(relationId)); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '请先加入联盟'); if (alliance.leader !== userName) fail(403, 'REALM_RELATION_LEADER_ONLY', '只有盟主可以结束外交关系'); if (!relation || relation.status !== 'active' || ![relation.allianceAId, relation.allianceBId].includes(alliance.id)) fail(404, 'REALM_RELATION_NOT_FOUND', '这项外交关系不存在或已经结束'); transaction(() => { if (!repo.endAllianceRelation({ allianceAId: relation.allianceAId, allianceBId: relation.allianceBId })) fail(409, 'REALM_RELATION_CONFLICT', '外交关系已经被其他操作结束'); repo.logAction({ actor: userName, action: 'alliance-relation', result: 'ended:' + relation.kind }); }); return overview(userName);
}

function declareWar(userName, targetName) {
  // 由盟主向其他联盟发起 24 小时战争
  settleExpiredWars();
  const alliance = repo.alliance(userName); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '请先加入联盟'); if (alliance.leader !== userName) fail(403, 'REALM_WAR_LEADER_ONLY', '只有盟主可以宣战'); const target = repo.allianceByName(typeof targetName === 'string' ? targetName.trim() : ''); if (!target) fail(404, 'REALM_WAR_TARGET', '找不到目标联盟'); if (target.id === alliance.id) fail(400, 'REALM_WAR_SELF', '不能向自己的联盟宣战'); if (repo.allianceRelation(alliance.id, target.id)) fail(409, 'REALM_WAR_RELATION', '结盟或停战期间不能宣战'); if (repo.warBetween(alliance.id, target.id)) fail(409, 'REALM_WAR_EXISTS', '两个联盟之间已有进行中的战争'); const cooldown = repo.warCooldown(alliance.id, target.id); if (cooldown && (Date.now() - sqlTimeValue(cooldown.settledAt)) < 24 * 60 * 60 * 1000) fail(409, 'REALM_WAR_COOLDOWN', '这两个联盟刚结束战争，24小时后才能再次宣战'); const endsAt = localSqlTime(new Date(Date.now() + 24 * 60 * 60 * 1000)); transaction(() => { if (!repo.insertWar({ attackerAllianceId: alliance.id, defenderAllianceId: target.id, endsAt })) fail(409, 'REALM_WAR_CONFLICT', '这两个联盟刚刚已经发起战争'); repo.logAction({ actor: userName, action: 'war-declare', result: alliance.name + '>' + target.name }); }); return overview(userName);
}

function createAlliance(userName, name) {
  // 在写事务内确认成员资格并创建联盟，避免并发请求绕过入盟检查
  collect(userName); if (typeof name !== 'string' || !name.trim()) fail(400, 'REALM_ALLIANCE_NAME', '联盟名称不能为空'); const allianceName = name.trim(); let alliance; transaction(() => { if (repo.alliance(userName)) fail(409, 'REALM_ALLIANCE_EXISTS', '你已经在一个联盟中'); alliance = repo.insertAlliance(allianceName, userName); if (!alliance) fail(409, 'REALM_ALLIANCE_TAKEN', '联盟名称已经被其他玩家使用'); repo.logAction({ actor: userName, action: 'alliance-create', result: allianceName }); }); return overview(userName);
}

function joinAlliance(userName, name) {
  // 加入一个还没有退出的联盟
  collect(userName); if (repo.alliance(userName)) fail(409, 'REALM_ALLIANCE_EXISTS', '你已经在一个联盟中'); const alliance = repo.allianceByName(typeof name === 'string' ? name.trim() : ''); if (!alliance) fail(404, 'REALM_ALLIANCE_NOT_FOUND', '找不到这个联盟'); transaction(() => { if (!repo.joinAlliance(alliance.id, userName)) fail(409, 'REALM_ALLIANCE_CONFLICT', '你已经加入其他联盟'); repo.logAction({ actor: userName, action: 'alliance-join', result: alliance.name }); }); return overview(userName);
}

function ensureAlliancePeace(alliance, errorCode, message) {
  // 阻止战争期间改变联盟关系破坏战争结算
  if (alliance && repo.activeWarForAlliance(alliance.id)) fail(409, errorCode, message);
}

function leaveAlliance(userName) {
  // 退出当前联盟，盟主退出前需要转让或解散
  const data = collect(userName); const alliance = repo.alliance(userName); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '你还没有加入联盟'); ensureAlliancePeace(alliance, 'REALM_ALLIANCE_WAR_LEAVE', '战争期间不能退出联盟'); if (alliance.leader === userName && alliance.members.length > 1) fail(409, 'REALM_ALLIANCE_LEADER_LEAVE', '盟主请先转让盟主或解散联盟'); transaction(() => { repo.removeAllianceMember(userName); if (!repo.alliance(userName)?.members.length && alliance.leader === userName) repo.deleteAlliance(alliance.id); repo.logAction({ actor: userName, action: 'alliance-leave', result: alliance.name }); }); return overview(userName);
}

function transferAlliance(userName, name) {
  // 将盟主转让给指定成员
  const alliance = repo.alliance(userName); const targetName = typeof name === 'string' ? name.trim() : ''; if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '你还没有加入联盟'); ensureAlliancePeace(alliance, 'REALM_ALLIANCE_WAR_TRANSFER', '战争期间不能转让盟主'); if (alliance.leader !== userName) fail(403, 'REALM_ALLIANCE_LEADER_ONLY', '只有盟主可以转让盟主'); if (!alliance.members.some(item => item.userName === targetName)) fail(404, 'REALM_ALLIANCE_MEMBER', '对方不是本联盟成员'); transaction(() => { if (!repo.updateAllianceLeader(alliance.id, userName, targetName)) fail(409, 'REALM_ALLIANCE_TRANSFER_CONFLICT', '联盟成员状态已经变化，请刷新后重试'); repo.logAction({ actor: userName, action: 'alliance-transfer', result: targetName }); }); return overview(userName);
}

function disbandAlliance(userName) {
  // 盟主解散联盟
  const alliance = repo.alliance(userName); if (!alliance) fail(400, 'REALM_ALLIANCE_REQUIRED', '你还没有加入联盟'); ensureAlliancePeace(alliance, 'REALM_ALLIANCE_WAR_DISBAND', '战争期间不能解散联盟'); if (alliance.leader !== userName) fail(403, 'REALM_ALLIANCE_LEADER_ONLY', '只有盟主可以解散联盟'); transaction(() => { repo.deleteAlliance(alliance.id); repo.logAction({ actor: userName, action: 'alliance-disband', result: alliance.name }); }); return overview(userName);
}

function attack(userName, q, r) {
  // 在锁定事务内重新读取双方状态并结算攻击
  const targetCoordinate = coordinates(q, r);
  collect(userName);
  const now = Date.now();
  const plunder = { grain: 0, wood: 0, ore: 0, essence: 0 };
  let success = false;
  let attackChance = 0;
  let warPoint = 0;
  let defenderName = '';
  transaction(() => {
    const data = repo.player(userName);
    const target = repo.tile(targetCoordinate.q, targetCoordinate.r);
    if (!data) fail(500, 'REALM_ATTACK_PLAYER_MISSING', '攻击者状态不存在');
    if (!target?.owner || target.owner === userName) fail(400, 'REALM_ATTACK_TARGET', '目标必须是其他玩家的领地');
    defenderName = target.owner;
    const defender = repo.player(defenderName);
    const attackerAlliance = repo.alliance(userName);
    const defenderAlliance = repo.alliance(defenderName);
    if (attackerAlliance && defenderAlliance && attackerAlliance.id === defenderAlliance.id) fail(409, 'REALM_ATTACK_ALLY', '不能攻击同一联盟的成员');
    const relation = attackerAlliance && defenderAlliance ? repo.allianceRelation(attackerAlliance.id, defenderAlliance.id) : null;
    if (relation) fail(409, 'REALM_ATTACK_RELATION', relation.kind === 'ally' ? '结盟期间不能攻击盟友' : '停战期间不能攻击对方');
    const war = attackerAlliance && defenderAlliance ? repo.warBetween(attackerAlliance.id, defenderAlliance.id) : null;
    if (defender?.shieldUntil && sqlTimeValue(defender.shieldUntil) > now) fail(409, 'REALM_TARGET_SHIELD', '目标正处于新城护盾保护中');
    if (data.attackReadyAt && sqlTimeValue(data.attackReadyAt) > now) fail(429, 'REALM_ATTACK_COOLDOWN', '攻击冷却中，请稍后再试');
    const adjacent = repo.tiles(target.q - 1, target.q + 1, target.r - 1, target.r + 1).some(item => item.owner === userName && distance(item.q, item.r, target.q, target.r) === 1);
    if (!adjacent) fail(400, 'REALM_ATTACK_ADJACENT', '只能从己方相邻领地发起攻击');
    if (data.ore < 35) fail(400, 'REALM_ATTACK_COST', '攻击需要 35 矿石');
    data.ore -= 35;
    data.attackReadyAt = localSqlTime(new Date(now + 90 * 1000));
    attackChance = attackChanceFor(data, target, userName);
    success = hash(target.q, target.r, repo.world().seed + data.ore) % 100 < attackChance;
    if (success && !repo.attackTile(target.q, target.r, defenderName, userName)) fail(409, 'REALM_ATTACK_CONFLICT', '目标地块刚刚被其他玩家改变');
    if (success && defender) {
      const currentDefender = repo.player(defenderName);
      if (!currentDefender) fail(500, 'REALM_ATTACK_PLAYER_MISSING', '防守方状态不存在');
      for (const key of GAIN_KEYS) {
        plunder[key] = Math.floor(currentDefender[key] * 0.08);
        currentDefender[key] -= plunder[key];
        data[key] += plunder[key];
      }
      currentDefender.shieldUntil = localSqlTime(new Date(Math.max(now + RAID_SHIELD_SECONDS * 1000, sqlTimeValue(currentDefender.shieldUntil) || 0)));
      repo.savePlayer(currentDefender);
    }
    repo.savePlayer(data);
    if (success && war && attackerAlliance && repo.addWarScore(war.id, war.attackerAllianceId === attackerAlliance.id ? 'attacker_score' : 'defender_score')) {
      repo.addWarParticipant(war.id, userName, attackerAlliance.id);
      warPoint = 1;
    }
    repo.insertBattleReport({ attacker: userName, defender: defenderName, q: target.q, r: target.r, success, plunder: success ? plunder : {}, warPoint });
    repo.logAction({ actor: userName, action: 'attack', q: target.q, r: target.r, result: success ? 'success:' + JSON.stringify(plunder) : 'blocked' });
  });
  return { ...overview(userName, targetCoordinate.q, targetCoordinate.r), success, attackChance, plunder: success ? plunder : null, warPoint, message: success ? '攻击成功，目标地块已纳入你的邑城并缴获部分物资' : '攻击失败，守军挡住了这次进攻' };
}

function breakthrough(userName) {
  // 在锁定事务内读取材料并结算一次大境界突破
  collect(userName); let success = false; transaction(() => { const data = repo.player(userName); if (!data) fail(500, 'REALM_BREAKTHROUGH_PLAYER_MISSING', '突破者状态不存在'); const required = breakthroughRequirements(data.stage); const activities = { ...activity(userName), relics: repo.explorationCount(userName) }; if (data.stage >= STAGES.length - 1) fail(400, 'REALM_STAGE_LIMIT', '当前修仙等级已经达到世界上限'); if (data.phase !== PHASES.length - 1) fail(400, 'REALM_PHASE_REQUIRED', '需要先修炼到圆满才能突破大境界'); if (data.cultivationExp < required.cultivationExp || data.essence < required.essence || activities.meals < required.meals || activities.posts < required.posts || activities.relics < required.relics) fail(400, 'REALM_BREAKTHROUGH_MATERIAL', `突破需要 ${required.cultivationExp} 修炼经验、${required.essence} 灵息、至少 ${required.meals} 次吃饭和 ${required.posts} 次发帖，以及 ${required.relics} 次遗迹探索`); data.cultivationExp -= required.cultivationExp; data.essence -= required.essence; success = hash(data.stage, data.phase, repo.world().seed + data.cultivationExp) % 100 < breakthroughChance(data); if (success) { data.stage += 1; data.phase = 0; } else data.phase = Math.max(0, data.phase - 2); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'breakthrough', result: success ? 'success' : 'failed' }); }); return { ...overview(userName), success };
}

function cultivate(userName) {
  // 在锁定事务内读取玩家状态并结算一次主动修炼
  collect(userName); transaction(() => { const data = repo.player(userName); if (!data) fail(500, 'REALM_CULTIVATE_PLAYER_MISSING', '修炼者状态不存在'); const alliance = repo.alliance(userName); const bonus = 1 + allianceBonus(alliance, 'academy'); const events = repo.activeEvents(userName); const eventBonus = events.reduce((sum, item) => sum + (item.payload.cultivationBonus || 0), 0); if (data.grain < 18 || data.essence < 4) fail(400, 'REALM_CULTIVATE_COST', '修炼需要 18 粮食和 4 灵息'); data.grain -= 18; data.essence -= 4; data.cultivationExp += Math.floor(((80 + data.stage * 12) * bonus + eventBonus) * (1 + (TALENTS[data.talent]?.cultivationBonus || 0)) * techniqueCultivationMultiplier(data)); if (data.cultivationExp >= 600 + data.stage * 300 && data.phase < PHASES.length - 1) { data.cultivationExp -= 600 + data.stage * 300; data.phase += 1; } repo.savePlayer(data); repo.logAction({ actor: userName, action: 'cultivate', result: 'success' }); }); return overview(userName);
}

function explore(userName, q, r) {
  // 在锁定事务内读取玩家和遗迹并结算一次探索
  const targetCoordinate = coordinates(q, r); ensureTiles(targetCoordinate.q, targetCoordinate.r, 0); collect(userName); let reward = null; transaction(() => { const data = repo.player(userName); const target = repo.tile(targetCoordinate.q, targetCoordinate.r); if (!data) fail(500, 'REALM_RELIC_PLAYER_MISSING', '探索者状态不存在'); if (!target || target.terrain !== '遗迹') fail(400, 'REALM_RELIC_REQUIRED', '只有遗迹地块可以探索'); const distanceFromHome = distance(data.homeQ, data.homeR, target.q, target.r); if (distanceFromHome > 20) fail(400, 'REALM_RELIC_TOO_FAR', '遗迹距离邑城太远'); reward = { essence: 4 + Math.min(12, distanceFromHome), ore: 8 + distanceFromHome * 2, cultivationExp: 40 + distanceFromHome * 10 }; if (!repo.exploreTile(target.q, target.r, userName)) fail(409, 'REALM_RELIC_EXPLORED', '你已经探索过这处遗迹'); data.essence += reward.essence; data.ore += reward.ore; data.cultivationExp += reward.cultivationExp; repo.savePlayer(data); repo.logAction({ actor: userName, action: 'explore', q: target.q, r: target.r, result: 'success' }); }); return { ...overview(userName, targetCoordinate.q, targetCoordinate.r), exploreReward: reward, exploreMessage: '遗迹探索完成，获得了稀有资源' };
}

function resolveEvent(userName, eventId, choiceKey) {
  // 在锁定事务内读取事件和玩家并结算一次参与
  collect(userName); let reward = null; let cost = {}; let choice = null; let completionReward = null; let participantCount = 0; let rewardMultiplier = 1; transaction(() => { const data = repo.player(userName); const event = repo.activeEvent(eventId, userName); if (!data) fail(500, 'REALM_EVENT_PLAYER_MISSING', '事件参与者状态不存在'); if (!event) fail(404, 'REALM_EVENT_NOT_FOUND', '这个事件已经结束或不存在'); choice = event.payload.choices?.find(item => item.key === choiceKey) || null; const baseReward = choice?.reward || event.payload.interaction?.reward; cost = choice?.cost || {}; if (event.payload.choices?.length && !choice) fail(400, 'REALM_EVENT_CHOICE_INVALID', '事件选择不存在'); if (!baseReward) fail(400, 'REALM_EVENT_NO_REWARD', '这个事件不支持参与领取'); for (const key of GAIN_KEYS) if (data[key] < Number(cost[key] || 0)) fail(400, 'REALM_EVENT_COST', '完成这个事件选择需要更多资源'); for (const key of GAIN_KEYS) data[key] -= Number(cost[key] || 0); if (!repo.claimEventParticipation(event.id, userName)) fail(409, 'REALM_EVENT_PARTICIPATED', '你已经参与过这个事件'); rewardMultiplier = eventRewardMultiplier(userName); reward = scaleEventReward(baseReward, rewardMultiplier); participantCount = repo.eventParticipantCount(event.id); applyReward(data, reward); if (event.payload.participantGoal && participantCount === event.payload.participantGoal) { const baseCompletionReward = event.payload.interaction.completionReward || null; completionReward = baseCompletionReward ? scaleEventReward(baseCompletionReward, rewardMultiplier) : null; if (completionReward) applyReward(data, completionReward); } repo.savePlayer(data); repo.logAction({ actor: userName, action: 'event', result: event.title + (choice ? ':' + choice.key : '') + ':' + participantCount }); }); return { ...overview(userName), reward, cost, choice: choice?.key || null, completionReward, participantCount, rewardMultiplier, message: completionReward ? '协作目标完成，额外战功已经发放' : '事件参与成功，奖励已经发放' };
}

function claimAchievement(userName, achievementKey) {
  // 在锁定事务内校验功勋进度并发放一次性奖励
  const achievement = ACHIEVEMENTS.find(item => item.key === achievementKey); if (!achievement) fail(404, 'REALM_ACHIEVEMENT_NOT_FOUND', '功勋不存在'); collect(userName); const current = overviewData(userName); const progress = achievement.progress(current); let reward = null; transaction(() => { const data = repo.player(userName); if (!data) fail(500, 'REALM_ACHIEVEMENT_PLAYER_MISSING', '功勋领取者状态不存在'); if (progress < achievement.goal) fail(400, 'REALM_ACHIEVEMENT_PROGRESS', '功勋尚未达成'); if (!repo.claimAchievement(userName, achievement.key)) fail(409, 'REALM_ACHIEVEMENT_CLAIMED', '这个功勋已经领取'); reward = achievement.reward; applyReward(data, reward); repo.savePlayer(data); repo.logAction({ actor: userName, action: 'achievement', result: achievement.key }); }); return { ...overview(userName), achievementReward: reward, achievementKey };
}

function claimDailyQuest(userName, questKey) {
  // 在锁定事务内重新计算任务进度并发放一次奖励
  collect(userName); let questReward = null; transaction(() => { const quest = dailyQuests(userName).find(item => item.key === questKey); const data = repo.player(userName); if (!data) fail(500, 'REALM_DAILY_QUEST_PLAYER_MISSING', '悬赏领取者状态不存在'); if (!quest) fail(404, 'REALM_DAILY_QUEST_NOT_FOUND', '今天没有这个悬赏'); if (quest.claimed) fail(409, 'REALM_DAILY_QUEST_CLAIMED', '这个悬赏今天已经领取'); if (quest.progress < quest.goal) fail(400, 'REALM_DAILY_QUEST_PROGRESS', '悬赏进度还没有完成'); if (!repo.claimDailyQuest(userName, quest.key)) fail(409, 'REALM_DAILY_QUEST_CONFLICT', '悬赏已经被其他操作领取'); applyReward(data, quest.reward); questReward = quest.reward; repo.savePlayer(data); repo.logAction({ actor: userName, action: 'daily-quest', result: quest.key }); }); return { ...overview(userName), dailyQuestReward: questReward, dailyQuest: questKey };
}

function destroyWorld(userName) {
  // 清空迩灵邑全部运行态数据并从第一赛季重新开始
  transaction(() => { const next = Math.floor(Math.random() * 2147483647); if (!repo.resetWorld(next)) fail(500, 'REALM_RESET_FAILED', '迩灵邑世界重置失败'); }); return overview(userName);
}

module.exports = { overview, rankingInfo, gather, seasonInfo, chooseTalent, learnTechnique, upgradeTechnique, claim, build, demolish, upgrade, specializeBuilding, activateBuilding, donate, allianceDonate, allianceProjectDonate, createTradeOrder, fillTradeOrder, cancelTradeOrder, proposeAllianceRelation, respondAllianceRelation, endAllianceRelation, declareWar, createAlliance, joinAlliance, leaveAlliance, transferAlliance, disbandAlliance, attack, attackWorldBoss, claimWorldBossAllianceRewards, breakthrough, cultivate, explore, resolveEvent, claimAchievement, claimDailyQuest, destroyWorld };
