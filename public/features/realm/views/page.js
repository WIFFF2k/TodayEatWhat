// 渲染迩灵邑六边形地图、资源面板和修炼操作
import { api, post } from '../../../shared/api.js';
import { escape } from '../../../shared/display.js';
import { busy, failure, toast } from '../../../shared/interaction.js';
const TERRAIN = { 平原: '平', 古林: '林', 矿脉: '矿', 灵泉: '泉', 遗迹: '迹' };
const REALM_REFRESH_MS = 15000;

function timeValue(value) {
  // 同时解析数据库本地时间、ISO 时间和毫秒时间戳
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).trim();
  const parsed = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text) ? Date.parse(text) : Date.parse(text.replace(' ', 'T') + '+08:00');
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentTime(view) {
  // 使用总览提供的服务端时间校正本机时钟偏差
  return Date.now() + Number(view._serverOffset || 0);
}

function tileLabel(tile) {
  // 生成地块按钮上的简短标识
  return tile.owner ? (tile.building === 'town' ? '邑' : tile.building ? '建' : '领') : TERRAIN[tile.terrain] || '野';
}

function renderMapLegend(view) {
  // 创建地图地形图例，帮助玩家理解六边形颜色
  const map = view.querySelector('#realmMap'); const wrap = map?.parentElement; if (!wrap || wrap.querySelector('.realm-map-legend')) return; const legend = document.createElement('div'); legend.className = 'realm-map-legend'; legend.innerHTML = Object.entries(TERRAIN).map(([terrain]) => '<span><i class="realm-legend-swatch terrain-' + escape(terrain) + '"></i>' + escape(terrain) + '</span>').join('') + '<span><i class="realm-legend-swatch special-event"></i>天地异动</span><span><i class="realm-legend-swatch special-boss"></i>世界首领</span>'; wrap.insertBefore(legend, map.nextSibling);
}

function insertRealmSidePanel(view, panel) {
  // 将侧栏面板插入直接子级调试工具之前，避免误选嵌套 details
  const side = view.querySelector('.realm-side'); if (!side) return;
  const anchor = Array.from(side.children).find(item => item.tagName === 'DETAILS'); side.insertBefore(panel, anchor || null);
}

function renderBuildingCatalog(view, data) {
  // 展示服务端下发的建筑成本与技能消耗，避免玩家靠试错规划资源
  view.querySelector('.realm-building-catalog')?.remove();
  const panel = document.createElement('section'); panel.className = 'realm-building-catalog';
  const list = (data.buildings || []).map(item => '<div><strong>' + escape(item.name) + '</strong><small>' + escape(item.terrain) + ' · 建造：' + escape(resourceText(item.cost)) + (item.eventRewardBonus ? ' · 每级天地异动奖励 +' + Math.round(item.eventRewardBonus * 100) + '%' : '') + (item.attackBonus ? ' · 每级攻击成功率 +' + Math.round(item.attackBonus * 100) + '%' : '') + (item.skill ? ' · 技能：' + escape(item.skill.name) + (Object.keys(item.skill.cost || {}).length ? '（消耗 ' + escape(resourceText(item.skill.cost)) + '）' : '') + (Object.keys(item.skill.reward || {}).length ? ' · 获得 ' + escape(eventRewardText(item.skill.reward)) : '') : '') + '</small></div>').join('');
  const achievements = (data.achievements || []).map(item => '<div><strong>' + escape(item.name) + (item.completed ? ' · 已达成' : '') + (item.claimed ? ' · 已领取' : '') + '</strong><small>' + escape(item.description) + ' · ' + item.progress + '/' + item.goal + ' · 奖励：' + escape(eventRewardText(item.reward)) + '</small>' + (item.completed && !item.claimed ? '<button class="btn secondary" data-achievement="' + escape(item.key) + '">领取奖励</button>' : '') + '</div>').join('');
  panel.innerHTML = '<h2>建筑手册</h2>' + (data.worldEventBonus ? '<small>当前天地异动奖励加成：+' + data.worldEventBonus + '%</small>' : '') + '<small>成功守城：' + Number(data.defenseWins || 0) + ' 次 · 失守：' + Number(data.defenseLosses || 0) + ' 次</small>' + list + '<h2>修士功勋</h2>' + achievements;
  panel.querySelectorAll('[data-achievement]').forEach(button => button.onclick = () => operate(view, '/realm/achievements/claim', { achievementKey: button.dataset.achievement }, '功勋奖励已领取'));
  window.setTimeout(() => { renderEventEffects(view, data); renderShieldStatus(view, data); }, 0);
  insertRealmSidePanel(view, panel);
}

function renderEventEffects(view, data) {
  // 将世界事件对主动行为的即时加成显示在事件卡片中
  const labels = { grainBonus: '主动采集粮食', woodBonus: '主动采集木材', oreBonus: '主动采集矿石', essenceBonus: '主动采集灵息', cultivationBonus: '主动修炼经验' };
  view.querySelectorAll('.realm-event-effect').forEach(item => item.remove());
  const effects = (data.events || []).map(item => Object.entries(item.payload || {}).filter(([key, value]) => labels[key] && Number(value) > 0).map(([key, value]) => labels[key] + ' +' + value).join(' · '));
  view.querySelectorAll('#realmEvents article').forEach((article, index) => { if (effects[index]) { const note = document.createElement('small'); note.className = 'realm-event-effect'; note.textContent = '本轮加成：' + effects[index]; article.append(note); } });
}

function renderTiles(view, data, centerQ, centerR) {
  // 按轴向坐标绘制固定视口的六边形地块
  renderBuildingCatalog(view, data);
  if (view._selectedTile && !data.tiles.some(item => item.q === view._selectedTile.q && item.r === view._selectedTile.r)) clearSelectedTile(view);
  const map = view.querySelector('#realmMap'); const byKey = new Map(data.tiles.map(item => [item.q + ',' + item.r, item])); const events = new Map((data.events || []).filter(item => Number.isSafeInteger(item.q) && Number.isSafeInteger(item.r)).map(item => [item.q + ',' + item.r, item])); const boss = data.worldBoss && Number.isSafeInteger(data.worldBoss.q) && Number.isSafeInteger(data.worldBoss.r) ? data.worldBoss : null; const buttons = [];
  for (let q = centerQ - 4; q <= centerQ + 4; q += 1) for (let r = centerR - 4; r <= centerR + 4; r += 1) { if (Math.abs(q - centerQ) + Math.abs(q + r - centerQ - centerR) + Math.abs(r - centerR) > 8) continue; const tile = byKey.get(q + ',' + r) || { q, r, terrain: '平原' }; const event = events.get(q + ',' + r); const isBoss = boss && boss.q === q && boss.r === r; const label = isBoss ? '王' : event ? '异' : tileLabel(tile); const eventClass = isBoss ? ' has-boss' : event ? ' has-event' : ''; const eventTitle = isBoss ? ' · 世界首领 ' + boss.name : event ? ' · ' + event.title : ''; buttons.push('<button class="realm-hex terrain-' + escape(tile.terrain) + eventClass + ' ' + (tile.owner ? 'owned' : '') + '" data-q="' + q + '" data-r="' + r + '" title="坐标 ' + q + ',' + r + ' · ' + escape(tile.terrain + eventTitle) + '"><span>' + label + '</span><small>' + q + ',' + r + '</small></button>'); }
  map.innerHTML = buttons.join(''); map.querySelectorAll('.realm-hex').forEach(button => { button.onclick = () => selectTile(view, data, Number(button.dataset.q), Number(button.dataset.r)); }); renderMapLegend(view); renderGatherControl(view, data.player); window.setTimeout(() => { bindEventLocations(view, data); bindWorldBossLocation(view, data); }, 0);
}

function showSelectedTile(view, data, q, r) {
  // 显示选中地块的操作面板
  view._selectedTile = { q, r };
  const tile = data.tiles.find(item => item.q === q && item.r === r) || { q, r, terrain: '平原' }; const panel = view.querySelector('#realmSelected'); const own = tile.owner === data.player.userName; const building = data.buildings.find(item => item.key === tile.building); const buildingName = building?.name || tile.building; const specialization = data.specializations?.find(item => item.key === tile.specialization); const skillReady = Number(tile.skillReadyAt || 0); const skillWait = Math.max(0, Math.ceil((skillReady - currentTime(view)) / 1000)); const buildButtons = data.buildings.filter(item => item.terrain === tile.terrain).map(item => '<button class="btn secondary" data-build="' + escape(item.key) + '">修建' + escape(item.name) + (item.defense ? '（防御+' + Math.round(item.defense * 100) + '%）' : '') + '</button>').join(''); const skillButton = own && building?.skill ? '<button class="btn secondary" data-skill ' + (skillWait ? 'disabled' : '') + '>' + escape(building.skill.name) + (skillWait ? '（冷却 ' + skillWait + ' 秒）' : '') + '</button>' : ''; const demolishButton = own && building && tile.building !== 'town' ? '<button class="btn danger" data-demolish>拆除建筑（返还 50%基础材料）</button>' : ''; const specializationButtons = own && tile.building && tile.building !== 'town' && tile.level >= 3 && !tile.specialization ? '<div class="realm-specializations"><small>选择一次建筑专精（木80 · 矿60 · 灵30）</small>' + (data.specializations || []).map(item => '<button class="btn secondary" data-specialize="' + escape(item.key) + '">' + escape(item.name) + '</button><small>' + escape(item.description) + '</small>').join('') + '</div>' : ''; const specializationText = specialization ? '<small>专精：' + escape(specialization.name) + ' · ' + escape(specialization.description) + '</small>' : ''; panel.innerHTML = '<strong>地块 ' + q + ',' + r + '</strong><span>' + escape(tile.terrain) + (tile.building ? ' · ' + escape(buildingName) + ' · '+tile.level+'级' : '') + '</span>' + (tile.owner ? '<small>归属：' + escape(tile.owner) + '</small>' : '<small>尚未归属</small>') + specializationText + (tile.explored ? '<small class="realm-event-done">已探索</small>' : '') + (own && !tile.building ? (buildButtons || '<small>当前地形暂时没有匹配建筑</small>') : '') + (own && tile.building && tile.building !== 'town' ? '<button class="btn" data-upgrade>升级建筑</button>' + skillButton + demolishButton + specializationButtons : '') + (!tile.owner ? '<button class="btn" data-claim>圈占此地</button>' : '') + (tile.terrain === '遗迹' && !tile.explored ? '<button class="btn secondary" data-explore>探索遗迹</button>' : '') + (tile.owner && !own ? '<button class="btn danger" data-attack>发起攻击</button>' : ''); panel.querySelector('[data-claim]')?.addEventListener('click', () => operate(view, '/realm/tiles/claim', { q, r }, '地块已纳入邑城')); panel.querySelectorAll('[data-build]').forEach(button => button.addEventListener('click', () => operate(view, '/realm/buildings', { q, r, building: button.dataset.build }, '建筑已建成'))); panel.querySelector('[data-upgrade]')?.addEventListener('click', () => operate(view, '/realm/buildings/upgrade', { q, r }, '建筑已升级')); panel.querySelector('[data-skill]')?.addEventListener('click', () => operate(view, '/realm/buildings/activate', { q, r }, '建筑技能已发动')); panel.querySelector('[data-demolish]')?.addEventListener('click', () => operate(view, '/realm/buildings/demolish', { q, r }, '建筑已拆除')); panel.querySelectorAll('[data-specialize]').forEach(button => button.addEventListener('click', () => operate(view, '/realm/buildings/specialize', { q, r, specialization: button.dataset.specialize }, '建筑专精已确定'))); panel.querySelector('[data-explore]')?.addEventListener('click', () => operate(view, '/realm/relics/explore', { q, r }, '遗迹探索完成')); panel.querySelector('[data-attack]')?.addEventListener('click', () => operate(view, '/realm/attack', { q, r }, '攻击行动已结算'));
}

function selectTile(view, data, q, r) {
  // 渲染地块操作面板并同步攻击冷却状态
  showSelectedTile(view, data, q, r); renderBuildingUpgradeHint(view, data, q, r); renderAttackPreview(view, data, q, r); renderAttackControl(view, data); bindDemolishGuard(view);
}

function bindDemolishGuard(view) {
  // 在已有拆除处理器前拦截误触，确认后继续执行原操作
  const button = view.querySelector('#realmSelected [data-demolish]'); if (!button || button.dataset.confirmBound) return; button.dataset.confirmBound = 'true'; button.addEventListener('click', event => { if (!window.confirm('确认拆除这座建筑吗？只返还基础建造材料的 50%。')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
}

function renderAttackPreview(view, data, q, r) {
  // 展示服务端根据当前双方建筑计算的攻城成功率
  const panel = view.querySelector('#realmSelected'); const tile = data.tiles.find(item => item.q === q && item.r === r); const old = panel?.querySelector('[data-attack-preview]'); old?.remove(); if (!panel || !tile || tile.owner === data.player.userName || typeof tile.attackChance !== 'number') return; const note = document.createElement('small'); note.dataset.attackPreview = 'true'; note.textContent = '预计攻城成功率：' + Math.round(tile.attackChance) + '%（实际出手时会重新结算）'; const button = panel.querySelector('[data-attack]'); if (button) panel.insertBefore(note, button);
}

function renderBuildingUpgradeHint(view, data, q, r) {
  // 在具体地块上展示下一等级的升级成本，规则与服务端公式保持一致
  const panel = view.querySelector('#realmSelected'); const tile = data.tiles.find(item => item.q === q && item.r === r); if (!panel || !tile || tile.owner !== data.player.userName || !tile.building || tile.building === 'town') return;
  const level = Math.max(1, Number(tile.level) || 1); const note = document.createElement('small'); note.textContent = '升至 ' + (level + 1) + ' 级：木材 ' + (25 * level) + ' · 矿石 ' + Math.floor(12.5 * level); const button = panel.querySelector('[data-upgrade]'); if (button) panel.insertBefore(note, button);
}

function renderAttackControl(view, data) {
  // 根据服务端攻击冷却时间更新敌方地块操作按钮
  const button = view.querySelector('#realmSelected [data-attack]'); if (!button) return; const readyAt = timeValue(data.player.attackReadyAt); const wait = Math.max(0, Math.ceil((readyAt - currentTime(view)) / 1000)); button.disabled = Boolean(wait); button.textContent = wait ? '发起攻击（冷却 ' + wait + ' 秒）' : '发起攻击'; if (wait) window.setTimeout(() => { if (view.isConnected) renderAttackControl(view, view._data || data); }, wait * 1000 + 50);
}

function clearSelectedTile(view) {
  // 清除视口切换后已经失效的地块操作面板
  view._selectedTile = null; const panel = view.querySelector('#realmSelected'); if (panel) panel.innerHTML = '<span class="muted">点击地图上的地块查看操作</span>';
}

function renderGatherControl(view, player) {
  // 根据服务端冷却时间更新主动采集按钮
  const button = view.querySelector('#realmCollect'); if (!button) return; const wait = Math.max(0, Math.ceil((Number(player.gatherReadyAt || 0) - currentTime(view)) / 1000)); button.disabled = Boolean(wait); button.textContent = wait ? '采集物资（冷却 ' + wait + ' 秒）' : '采集物资'; if (wait) window.setTimeout(() => { if (view.isConnected) renderGatherControl(view, view._data?.player || player); }, wait * 1000 + 50);
}

function renderShieldStatus(view, data) {
  // 展示出生、战后或玄甲营护盾的剩余时间
  const panel = view.querySelector('#realmCultivation'); if (!panel) return; panel.querySelector('[data-shield-status]')?.remove(); const end = timeValue(data.player.shieldUntil); const wait = Math.max(0, Math.ceil((end - currentTime(view)) / 1000)); if (!wait) return; const note = document.createElement('small'); note.className = 'realm-shield-status'; note.dataset.shieldStatus = 'true'; note.textContent = '护盾保护中，剩余约 ' + (wait >= 60 ? Math.ceil(wait / 60) + ' 分钟' : wait + ' 秒'); panel.append(note); window.setTimeout(() => { if (view.isConnected && view._data === data) renderShieldStatus(view, data); }, Math.min(wait * 1000 + 50, 60000));
}

function hasActiveRealmInput(view) {
  // 只把正在编辑的表单控件视为需要保护的输入状态
  const active = view.querySelector(':focus'); return Boolean(active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName));
}

function scheduleRealmRefresh(view) {
  // 定时同步多人世界状态并在页面离开后停止调度
  if (view._realmRefreshTimer) window.clearTimeout(view._realmRefreshTimer);
  const refresh = async () => {
    if (!view.isConnected) { view._realmRefreshTimer = null; return; }
    if (view._busy || document.visibilityState === 'hidden' || hasActiveRealmInput(view)) { scheduleRealmRefresh(view); return; }
    try {
      const query = '?q=' + encodeURIComponent(view._centerQ) + '&r=' + encodeURIComponent(view._centerR);
      const data = await api('/realm/overview' + query);
      if (!view.isConnected) { view._realmRefreshTimer = null; return; }
      view._data = data;
      renderRealmContent(view);
      if (view._selectedTile) selectTile(view, data, view._selectedTile.q, view._selectedTile.r);
    } catch (error) {
      if (!view._realmRefreshErrorShown) { view._realmRefreshErrorShown = true; failure(error); }
    } finally {
      if (view.isConnected) { view._realmRefreshErrorShown = false; scheduleRealmRefresh(view); }
      else view._realmRefreshTimer = null;
    }
  };
  view._realmRefreshTimer = window.setTimeout(refresh, REALM_REFRESH_MS);
}

async function operate(view, url, body, message) {
  // 执行地图操作并刷新当前视口
  if (view._busy) return; view._busy = true; busy(true); try { const data = await post(url, body); view._data = data; if (!Number.isInteger(view._centerQ)) view._centerQ = data.player.homeQ; if (!Number.isInteger(view._centerR)) view._centerR = data.player.homeR; renderRealmContent(view); if (view._selectedTile) selectTile(view, data, view._selectedTile.q, view._selectedTile.r); toast(operationMessage(data, url, message)); } catch (error) { failure(error); } finally { view._busy = false; busy(false); }
}

function operationMessage(data, url, message) {
  // 将服务端操作结果转换为统一的用户提示
  if (data.gatherReward) return '本次采集：' + gatherRewardText(data.gatherReward);
  if (data.bossPersonalReward) return '首领已击杀，你排名第 ' + data.bossPersonalRank + '，获得 ' + eventRewardText(data.bossPersonalReward);
  if (data.skillReward) return message + '：获得 ' + eventRewardText(data.skillReward);
  if (data.exploreReward) return message + '：获得 ' + eventRewardText(data.exploreReward);
  if (data.dailyQuestReward) return message + '：获得 ' + eventRewardText(data.dailyQuestReward);
  if (data.achievementReward) return message + '：获得 ' + eventRewardText(data.achievementReward);
  if (data.demolishRefund) return message + '，返还 ' + eventRewardText(data.demolishRefund);
  if (typeof data.attackChance === 'number') return message + '（本次成功率 ' + Math.round(data.attackChance) + '%）' + (data.success && data.plunder ? '，掠得 ' + eventRewardText(data.plunder) : '');
  if (data.claimedRewards) return message + '，共入仓 ' + data.claimedRewards + ' 笔';
  if (url.endsWith('/breakthrough') && typeof data.success === 'boolean') return data.success ? '突破成功，已进入新的大境界' : '突破失败，境界有所回落';
  if (data.success && data.plunder && Object.values(data.plunder).some(value => Number(value) > 0)) return message + '，掠得 ' + eventRewardText(data.plunder) + (data.warPoint ? '，联盟战争积分 + ' + data.warPoint : '');
  if (data.warPoint) return message + '，联盟战争积分 + ' + data.warPoint;
  if (data.completionReward) return message + '，协作额外奖励：' + eventRewardText(data.completionReward) + (data.rewardMultiplier > 1 ? '（观星台加成 ×' + data.rewardMultiplier.toFixed(2) + '）' : '');
  if (data.rewardMultiplier && data.rewardMultiplier > 1) return message + '（观星台加成 ×' + data.rewardMultiplier.toFixed(2) + '）';
  return message;
}

function renderRealmContent(view) {
  // 更新资源、地图、修炼和事件展示
  const serverTime = Number(view._data?.serverTime); if (Number.isFinite(serverTime)) view._serverOffset = serverTime - Date.now();
  if (view._data.season) view._season = view._data.season;
  if (!view.querySelector('.realm-donate')) bindDonation(view);
  renderSeason(view, view._data); renderRanking(view, view._data); renderCultivationRanking(view, view._data); renderOwnRankingStatus(view, view._data); renderDailyQuests(view, view._data); renderTradeMarket(view, view._data); renderBattleReports(view, view._data); renderOnlinePlayers(view, view._data); renderActions(view, view._data); view.querySelector('.realm-alliance')?.remove(); bindAlliance(view); bindAllianceRelations(view); bindAllianceProjects(view); renderWorldBoss(view, view._data);
  const data = view._data; const player = data.player; const need = data.breakthrough; const breakthroughText = need.available ? '下次突破需要：经验 ' + need.cultivationExp + ' · 灵息 ' + need.essence + ' · 吃饭 ' + need.meals + ' · 发帖 ' + need.posts + ' · 遗迹 ' + need.relics + ' · 成功率 ' + need.chance + '%' : '已达到当前世界境界上限，修炼经验将继续积累'; view.querySelector('#realmStats').innerHTML = '<span>粮食 ' + player.grain + '</span><span>木材 ' + player.wood + '</span><span>矿石 ' + player.ore + '</span><span>灵息 ' + player.essence + '</span>'; view.querySelector('#realmCultivation').innerHTML = '<strong>' + escape(data.stages[player.stage]) + ' · ' + escape(data.phases[player.phase]) + '</strong><span>修炼经验 ' + player.cultivationExp + '</span><span>共同活动 ' + data.activities.total + ' 次（吃饭 ' + data.activities.meals + ' · 发帖 ' + data.activities.posts + ' · 遗迹 ' + data.activities.relics + '）</span><small>' + breakthroughText + '</small><button class="btn" id="realmCultivate">静心修炼</button>' + (need.available ? '<button class="btn secondary" id="realmBreakthrough">尝试突破</button>' : ''); view.querySelector('#realmCultivate').onclick = () => operate(view, '/realm/cultivate', {}, '修炼完成，境界经验增加'); view.querySelector('#realmBreakthrough')?.addEventListener('click', () => operate(view, '/realm/breakthrough', {}, '突破结果已结算')); renderTiles(view, data, view._centerQ, view._centerR); view.querySelector('#realmEvents').innerHTML = data.events.length ? data.events.map(event => { const choices = event.participated ? '<small class="realm-event-done">已参与</small>' : event.payload?.choices?.length ? event.payload.choices.map(choice => '<button class="btn secondary" data-event="' + event.id + '" data-choice="' + escape(choice.key) + '">' + escape(choice.label + (eventCostText(choice.cost) ? '（消耗 ' + eventCostText(choice.cost) + '）' : '') + (eventRewardText(choice.reward) ? '，获得 ' + eventRewardText(choice.reward) : '')) + '</button>').join('') : event.payload?.interaction ? '<button class="btn secondary" data-event="' + event.id + '">' + escape(event.payload.interaction.label + (eventRewardText(event.payload.interaction.reward) ? '（获得 ' + eventRewardText(event.payload.interaction.reward) + '）' : '')) + '</button>' : ''; const progress = event.payload?.participantGoal ? ' · 协作 ' + event.participantCount + '/' + event.payload.participantGoal : ''; const completion = event.payload?.participantGoal && event.payload?.interaction?.completionReward ? '<small class="realm-event-completion">协作达成额外奖励：' + escape(eventRewardText(event.payload.interaction.completionReward)) + '</small>' : ''; return '<article><strong>' + escape(event.title) + '</strong><p>' + escape(event.description) + progress + '</p>' + completion + choices + '</article>'; }).join('') : '<p class="muted">这片天地暂时风平浪静</p>'; view.querySelectorAll('[data-event]').forEach(button => { button.onclick = () => operate(view, '/realm/events/resolve', { eventId: Number(button.dataset.event), choiceKey: button.dataset.choice || undefined }, '事件奖励已结算'); });
  const production = view._data.productionPerTick || {}; const stats = view.querySelector('#realmStats'); if (stats) { const note = document.createElement('small'); note.className = 'realm-production'; note.textContent = '每2分钟自动：粮+' + Number(production.grain || 0) + ' · 木+' + Number(production.wood || 0) + ' · 矿+' + Number(production.ore || 0) + ' · 灵+' + Number(production.essence || 0); stats.append(note); }
}

function renderWorldBoss(view, data) {
  // 展示世界首领血量、个人伤害、贡献榜和攻击入口
  renderWarTimers(view, data);
  renderStageRoadmap(view, data);
  view.querySelector('.realm-world-boss')?.remove();
  if (!data.worldBoss) {
    const side = view.querySelector('.realm-side');
    if (!side) return;
    const panel = document.createElement('section');
    panel.className = 'realm-world-boss';
    const wait = Math.max(0, Math.ceil((timeValue(data.worldBossNextAt) - currentTime(view)) / 60000));
    const nextAt = data.worldBossNextAt ? '<small>预计开始：' + escape(String(data.worldBossNextAt)) + '</small>' : '';
    panel.innerHTML = '<h2>世界首领</h2><p>本场围猎已结束，下一场首领将在准备间隔结束后出现。</p>' + nextAt + '<small>' + (wait ? '预计还有约 ' + wait + ' 分钟' : '下一场即将生成') + '</small>';
    insertRealmSidePanel(view, panel);
    return;
  }
  view.querySelector('.realm-world-boss')?.remove(); if (!data.worldBoss) return; const side = view.querySelector('.realm-side'); const panel = document.createElement('section'); panel.className = 'realm-world-boss'; const boss = data.worldBoss; const defeated = Boolean(boss.defeatedAt); const percent = Math.max(0, Math.min(100, Math.round(boss.currentHp / boss.maxHp * 100))); const wait = Math.max(0, Math.ceil((boss.personal.lastAttackAt + 20000 - currentTime(view)) / 1000)); const rewardText = reward => eventRewardText(reward); const result = data.bossDamage ? '<small class="realm-boss-result">本次造成 ' + data.bossDamage + ' 点伤害' + (data.bossDefeated ? '，首领已被击杀，奖励已发放' : '') + '</small>' : ''; const personalReward = data.bossPersonalReward || boss.personal.reward; const personalRank = data.bossPersonalRank || boss.personal.rank; const personalResult = personalReward ? '<small class="realm-boss-result">你的最终排名：第 ' + personalRank + ' 名 · 获得 ' + escape(rewardText(personalReward)) + '</small>' : ''; const allianceRanking = boss.allianceRanking?.length ? '<div class="realm-boss-alliance-ranking"><b>联盟贡献榜</b>' + boss.allianceRanking.map(item => '<span>' + item.rank + '. ' + escape(item.allianceName) + ' · ' + item.damage + '（' + item.members + '人）</span>').join('') + '</div>' : ''; const allianceRewards = boss.allianceRewards?.length ? '<div class="realm-boss-alliance-ranking"><b>联盟奖励</b>' + boss.allianceRewards.map(item => '<span>' + item.rank + '. ' + escape(item.allianceName) + ' · 粮' + item.grain + ' 木' + item.wood + ' 矿' + item.ore + ' 灵' + item.essence + (item.delivered ? '（已入仓）' : '（待领取）') + '</span>').join('') + '</div>' : ''; const ranking = boss.ranking.length ? '<div class="realm-boss-ranking">' + boss.ranking.map(item => '<span>' + item.rank + '. ' + escape(item.userName) + ' · ' + item.damage + (item.reward ? ' · 奖励 ' + escape(rewardText(item.reward)) : '') + '</span>').join('') + '</div>' : ''; panel.innerHTML = '<h2>世界首领</h2><strong>' + escape(boss.name) + ' · ' + escape(boss.phase?.name || '常态') + '</strong><p>' + escape(boss.description) + '</p><small>坐标 ' + boss.q + ',' + boss.r + ' · 血量 ' + boss.currentHp + '/' + boss.maxHp + '（' + percent + '%） · 参战 ' + boss.participantCount + ' 人</small>' + (defeated ? '<small class="realm-boss-result">本场首领已被击杀，以下为最终战报</small>' : '') + result + personalResult + (boss.personal.damage ? '<small>你的伤害 ' + boss.personal.damage + '（' + boss.personal.attacks + ' 次攻击）</small>' : '<small>你还没有参与这场围猎</small>') + ranking + allianceRanking + allianceRewards + '<button class="btn danger" data-boss-attack ' + (wait || defeated ? 'disabled' : '') + '>出手围猎' + (defeated ? '（已结束）' : wait ? '（冷却 ' + wait + ' 秒）' : '（20 矿石 · 3 灵息）') + '</button>'; panel.querySelector('[data-boss-attack]')?.addEventListener('click', () => operate(view, '/realm/world-boss/attack', {}, '首领攻击已结算')); insertRealmSidePanel(view, panel); if (wait > 0 && !defeated) window.setTimeout(() => { if (view._data === data) renderWorldBoss(view, data); }, wait * 1000 + 50);
}

function renderWarTimers(view, data) {
  // 为进行中的联盟战争补充剩余时间
  view.querySelectorAll('.realm-wars>div').forEach((row, index) => { const war = data.wars?.[index]; if (!war || war.settledAt || row.querySelector('[data-war-time]')) return; const endsAt = timeValue(war.endsAt); const remaining = Math.max(0, Math.ceil((endsAt - currentTime(view)) / 3600000)); const timer = document.createElement('small'); timer.dataset.warTime = 'true'; timer.textContent = remaining ? '剩余约 ' + remaining + ' 小时' : '即将结算'; row.append(timer); });
}

function renderStageRoadmap(view, data) {
  // 在修炼面板中展示全部大境界和当前进度
  const panel = view.querySelector('#realmCultivation'); if (!panel || !data.stages?.length) return; const previous = panel.querySelector('.realm-stage-roadmap'); const expanded = Boolean(previous?.open); previous?.remove(); const player = data.player; const roadmap = document.createElement('details'); roadmap.className = 'realm-stage-roadmap'; roadmap.open = expanded; roadmap.innerHTML = '<summary>查看境界谱</summary><div>' + data.stages.map((stage, index) => '<span class="' + (index < player.stage ? 'completed' : index === player.stage ? 'current' : '') + '"><b>' + (index + 1) + '</b>' + escape(stage) + '<small>' + escape(data.phases.join(' · ')) + '</small></span>').join('') + '</div>'; panel.append(roadmap);
}

function bindDonation(view) {
  // 添加向其他玩家捐赠指定资源的操作面板
  const side = view.querySelector('.realm-side'); const form = document.createElement('form'); form.className = 'realm-donate'; form.innerHTML = '<h2>物资援助</h2><input name="recipient" required placeholder="玩家姓名"><select name="resource"><option value="grain">粮食</option><option value="wood">木材</option><option value="ore">矿石</option><option value="essence">灵息</option></select><input name="amount" type="number" min="1" required placeholder="数量"><button class="btn" type="submit">捐赠物资</button>'; insertRealmSidePanel(view, form); form.onsubmit = async event => { event.preventDefault(); await operate(view, '/realm/donate', { recipient: form.recipient.value, resource: form.resource.value, amount: Number(form.amount.value) }, '物资已送达'); form.reset(); };
}

function bindAlliance(view) {
  // 绑定联盟创建、加入、退出和仓库捐赠
  const side = view.querySelector('.realm-side'); const panel = document.createElement('section'); panel.className = 'realm-alliance'; insertRealmSidePanel(view, panel); const alliance = view._data.alliance; if (!alliance) { panel.innerHTML = '<h2>联盟</h2><input class="realm-alliance-name" placeholder="联盟名称"><button class="btn secondary" data-create>创建联盟</button><button class="btn secondary" data-join>加入联盟</button>'; panel.querySelector('[data-create]').onclick = () => operate(view, '/realm/alliances', { name: panel.querySelector('.realm-alliance-name').value }, '联盟已创建'); panel.querySelector('[data-join]').onclick = () => operate(view, '/realm/alliances/join', { name: panel.querySelector('.realm-alliance-name').value }, '已加入联盟'); return; } const leaderControls = alliance.leader === view._data.player.userName ? '<input class="realm-alliance-transfer" placeholder="转让盟主给成员"><button class="btn secondary" data-transfer>转让盟主</button><button class="btn danger" data-disband>解散联盟</button>' : ''; const warehouse = '粮' + alliance.grain + ' · 木' + alliance.wood + ' · 矿' + alliance.ore + ' · 灵' + alliance.essence; panel.innerHTML = '<h2>' + escape(alliance.name) + '</h2><p class="muted">盟主 ' + escape(alliance.leader) + ' · 仓库 ' + warehouse + '</p><select class="realm-alliance-resource"><option value="grain">粮食</option><option value="wood">木材</option><option value="ore">矿石</option><option value="essence">灵息</option></select><input class="realm-alliance-amount" type="number" min="1" placeholder="投入数量"><button class="btn secondary" data-donate>捐入仓库</button>' + leaderControls + '<button class="btn danger" data-leave>退出联盟</button><div class="realm-alliance-members">' + alliance.members.slice(0, 6).map(item => '<span>' + escape(item.userName) + ' · 贡献 ' + item.contribution + '</span>').join('') + '</div>'; panel.querySelector('[data-donate]').onclick = () => operate(view, '/realm/alliances/donate', { resource: panel.querySelector('.realm-alliance-resource').value, amount: Number(panel.querySelector('.realm-alliance-amount').value) }, '物资已捐入联盟仓库'); panel.querySelector('[data-transfer]')?.addEventListener('click', () => operate(view, '/realm/alliances/transfer', { name: panel.querySelector('.realm-alliance-transfer').value }, '盟主已转让')); panel.querySelector('[data-disband]')?.addEventListener('click', () => operate(view, '/realm/alliances/disband', {}, '联盟已解散')); panel.querySelector('[data-leave]').onclick = () => operate(view, '/realm/alliances/leave', {}, '已退出联盟'); bindAllianceBossRewards(view, panel);
}

function bindAllianceBossRewards(view, panel) {
  // 展示联盟尚未入仓的世界首领奖励
  const rewards = view._data.allianceBossRewards || []; if (!rewards.length) return; const box = document.createElement('div'); box.className = 'realm-alliance-boss-rewards'; const labels = { grain: '粮', wood: '木', ore: '矿', essence: '灵' }; const list = rewards.map(item => '<span>第' + item.rank + '名 · ' + escape(item.allianceName) + ' · ' + ['grain', 'wood', 'ore', 'essence'].map(key => labels[key] + item[key]).join(' ') + '</span>').join(''); box.innerHTML = '<strong>待领取首领奖励 ' + rewards.length + ' 笔</strong><small>联盟成员领取后会统一存入仓库</small><div>' + list + '</div><button class="btn secondary" data-claim-boss-rewards>领取入仓</button>'; box.querySelector('[data-claim-boss-rewards]').onclick = () => operate(view, '/realm/alliances/world-boss-rewards/claim', {}, '首领奖励已入仓'); panel.append(box);
}

function bindAllianceRelations(view) {
  // 展示联盟外交关系并绑定申请处理操作
  view.querySelector('.realm-relations')?.remove(); if (!view._data.alliance) return; const alliance = view._data.alliance; const leader = alliance.leader === view._data.player.userName; const types = view._data.allianceRelationTypes || []; const typeName = Object.fromEntries(types.map(item => [item.key, item.name])); const relations = (view._data.allianceRelations || []).filter(item => ['pending', 'active'].includes(item.status)); const list = relations.length ? relations.map(item => { const incoming = item.status === 'pending' && item.proposerAllianceId !== alliance.id; const state = item.status === 'active' ? typeName[item.kind] + '已生效' : incoming ? '收到' + typeName[item.kind] + '申请' : '申请已发出'; const controls = item.status === 'active' && leader ? '<button class="btn danger" data-relation-end="' + item.relationId + '">解除关系</button>' : incoming && leader ? '<button class="btn secondary" data-relation-respond="' + item.relationId + '" data-accept="true">接受</button><button class="btn danger" data-relation-respond="' + item.relationId + '" data-accept="false">拒绝</button>' : ''; return '<div class="realm-relation"><strong>' + escape(item.targetName) + '</strong><small>' + escape(state) + '</small>' + controls + '</div>'; }).join('') : '<small>当前没有外交关系</small>'; const proposer = leader ? '<div class="realm-relation-form"><input name="relationTarget" placeholder="目标联盟名称"><select name="relationKind">' + types.map(item => '<option value="' + escape(item.key) + '">' + escape(item.name) + '</option>').join('') + '</select><button class="btn secondary" data-relation-propose>发起申请</button></div>' : ''; const panel = document.createElement('section'); panel.className = 'realm-relations'; panel.innerHTML = '<h2>联盟外交</h2>' + list + proposer; insertRealmSidePanel(view, panel); panel.querySelector('[data-relation-propose]')?.addEventListener('click', () => operate(view, '/realm/alliances/relations', { targetAlliance: panel.querySelector('[name="relationTarget"]').value, kind: panel.querySelector('[name="relationKind"]').value }, '外交申请已发出')); panel.querySelectorAll('[data-relation-respond]').forEach(button => button.addEventListener('click', () => operate(view, '/realm/alliances/relations/respond', { relationId: Number(button.dataset.relationRespond), accept: button.dataset.accept === 'true' }, button.dataset.accept === 'true' ? '外交关系已生效' : '外交申请已拒绝'))); panel.querySelectorAll('[data-relation-end]').forEach(button => button.addEventListener('click', () => operate(view, '/realm/alliances/relations/end', { relationId: Number(button.dataset.relationEnd) }, '外交关系已解除')));
}

function bindAllianceProjects(view) {
  // 展示联盟公共工程与投入入口
  view.querySelector('.realm-projects')?.remove(); if (!view._data.alliance) return; const panel = document.createElement('section'); panel.className = 'realm-projects'; const sourceLabel = { personal: '个人', warehouse: '仓库' }; panel.innerHTML = '<h2>公共工程</h2><small class="muted">可使用个人粮食，或直接消耗联盟仓库粮食；下方显示累计投入榜</small>' + view._data.allianceProjects.map(project => { const current = view._data.alliance.projects.find(item => item.projectKey === project.key) || { level: 0, progress: 0 }; const contributions = (view._data.alliance.projectContributions || []).filter(item => item.projectKey === project.key).slice(0, 5); const ranking = contributions.length ? '<div class="realm-project-contributors">' + contributions.map(item => '<span>' + escape(item.userName) + ' · ' + item.amount + '（' + sourceLabel[item.source] + '）</span>').join('') + '</div>' : '<small>还没有投入记录</small>'; return '<div><strong>' + escape(project.name) + ' · ' + current.level + '级</strong><small>' + escape(project.description) + ' · 进度 ' + current.progress + '/' + project.required + '</small>' + ranking + '<select data-project-source="' + escape(project.key) + '"><option value="personal">个人投入</option><option value="warehouse">联盟仓库</option></select><input type="number" min="1" data-project-amount="' + escape(project.key) + '" placeholder="投入粮食"><button class="btn secondary" data-project="' + escape(project.key) + '">投入</button></div>'; }).join(''); insertRealmSidePanel(view, panel); panel.querySelectorAll('[data-project]').forEach(button => { button.onclick = () => operate(view, '/realm/alliances/projects/donate', { projectKey: button.dataset.project, amount: Number(panel.querySelector('[data-project-amount="' + button.dataset.project + '"]').value), source: panel.querySelector('[data-project-source="' + button.dataset.project + '"]').value }, '公共工程已投入'); });
}

function renderRanking(view, data) {
  // 展示当前世界的领地排行榜
  let panel = view.querySelector('.realm-ranking'); if (!panel) { panel = document.createElement('section'); panel.className = 'realm-ranking'; panel.innerHTML = '<h2>邑城榜</h2><div></div>'; insertRealmSidePanel(view, panel); } panel.querySelector('div').innerHTML = data.ranking.slice(0, 8).map((item, index) => '<div><b>' + (index + 1) + '</b><span>' + escape(item.userName) + '</span><small>' + item.territory + ' 地 · ' + escape(data.stages[item.stage]) + '</small></div>').join('');
}

function renderCultivationRanking(view, data) {
  // 展示当前世界的修炼境界排行榜
  let panel = view.querySelector('.realm-cultivation-ranking'); if (!panel) { panel = document.createElement('section'); panel.className = 'realm-ranking realm-cultivation-ranking'; panel.innerHTML = '<h2>修炼榜</h2><div></div>'; insertRealmSidePanel(view, panel); } panel.querySelector('div').innerHTML = (data.cultivationRanking || []).slice(0, 8).map((item, index) => '<div><b>' + (index + 1) + '</b><span>' + escape(item.userName) + '</span><small>' + escape(data.stages[item.stage]) + '·' + escape(data.phases[item.phase]) + ' · ' + item.cultivationExp + ' 经验</small></div>').join('');
}

function renderOwnRankingStatus(view, data) {
  // 在榜单标题显示当前玩家的可见排名
  const rankText = (items) => { const index = (items || []).findIndex(item => item.userName === data.player.userName); return index >= 0 ? ' · 你是第' + (index + 1) + '名' : ' · 你暂未进入前20'; }; view.querySelector('.realm-ranking:not(.realm-cultivation-ranking) h2').textContent = '邑城榜' + rankText(data.ranking); view.querySelector('.realm-cultivation-ranking h2').textContent = '修炼榜' + rankText(data.cultivationRanking);
}

function renderActions(view, data) {
  // 展示全服最近的领地、建设和交互动态
  let panel = view.querySelector('.realm-actions'); if (!panel) { panel = document.createElement('section'); panel.className = 'realm-actions'; panel.innerHTML = '<h2>天下动态</h2><div></div>'; insertRealmSidePanel(view, panel); } const labels = { gather: '采集了物资', cultivate: '完成了静心修炼', claim: '圈占了新地块', build: '建成了建筑', upgrade: '升级了建筑', specialize: '确定了建筑专精', 'building-skill': '发动了建筑技能', attack: '发起了攻击', 'world-boss': '围猎了世界首领', 'world-boss-reward': '获得了世界首领奖励', 'world-boss-alliance-reward': '领取了世界首领奖励入仓', 'war-warehouse-reward': '将战争胜利奖励存入联盟仓库', explore: '探索了遗迹', event: '参与了天地异动', donate: '完成了物资捐赠', 'alliance-donate': '捐入了联盟仓库', breakthrough: '尝试了境界突破', talent: '完成了灵根觉醒', 'technique-learn': '开始修习功法', 'technique-upgrade': '提升了功法境界', 'daily-quest': '领取了每日悬赏', achievement: '领取了修士功勋', 'alliance-create': '创建了联盟', 'alliance-join': '加入了联盟', 'alliance-leave': '退出了联盟', 'alliance-transfer': '转让了盟主', 'alliance-disband': '解散了联盟', 'war-declare': '发起了联盟战争', 'war-reward': '获得了联盟战争个人奖励', 'alliance-relation': '处理了联盟外交', 'trade-create': '发布了交易订单', 'trade-fill': '完成了资源交易', 'trade-cancel': '取消了交易订单', 'trade-expire': '订单到期并退回托管资源', 'project-donate': '投入了联盟工程' }; panel.querySelector('div').innerHTML = (data.actions || []).slice(0, 10).map(item => '<div><strong>' + escape(item.actor) + '</strong><span>' + escape(labels[item.action] || '进行了一次行动') + '</span><small>' + escape(item.createdAt) + '</small></div>').join('') || '<p class="muted">世界还没有新的动态</p>';
}

function renderBattleReports(view, data) {
  // 展示当前玩家参与的最近攻防战报
  let panel = view.querySelector('.realm-battle-reports');
  if (!panel) { panel = document.createElement('section'); panel.className = 'realm-battle-reports'; insertRealmSidePanel(view, panel); }
  const labels = { grain: '粮', wood: '木', ore: '矿', essence: '灵' };
  const reports = data.battleReports || [];
  panel.innerHTML = '<h2>攻防战报</h2>' + (reports.length ? reports.map(report => { const attacking = report.attacker === data.player.userName; const other = attacking ? report.defender : report.attacker; const loot = Object.entries(report.plunder || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => labels[key] + value).join(' · '); const warPoint = Number(report.warPoint || 0) > 0 ? ' · ' + (attacking ? '己方联盟战争积分 +' : '对方联盟战争积分 +') + report.warPoint : ''; return '<div class="realm-battle-report"><strong>' + (attacking ? '你进攻了 ' : '你防守了 ') + escape(other) + '</strong><small>' + (report.success ? (attacking ? '夺地成功' : '守地失守') : (attacking ? '进攻失败' : '防守成功')) + ' · 坐标 ' + report.q + ',' + report.r + (loot ? ' · 掠夺 ' + loot : '') + warPoint + '</small><small>' + escape(report.createdAt) + '</small></div>'; }).join('') : '<small>还没有参与过攻防</small>');
}

function renderOnlinePlayers(view, data) {
  // 展示最近活跃的局域网玩家，帮助确认多人同步状态
  let panel = view.querySelector('.realm-online-players');
  if (!panel) { panel = document.createElement('section'); panel.className = 'realm-online-players'; insertRealmSidePanel(view, panel); }
  const players = data.onlinePlayers || [];
  panel.innerHTML = '<h2>同游修士 <small>' + players.length + '</small></h2>' + (players.length ? '<div>' + players.map(item => '<span>' + (item.userName === data.player.userName ? '<b>你</b> ' : '') + escape(item.userName) + ' · ' + escape(data.stages[item.stage]) + ' · ' + escape(data.phases[item.phase]) + '<small>最近活跃 ' + escape(item.lastSeenAt) + '</small></span>').join('') + '</div>' : '<small>暂时没有活跃修士</small>');
}

function bindEventLocations(view, data) {
  // 为有坐标的天地异动添加一键前往按钮
  const articles = view.querySelectorAll('#realmEvents article');
  (data.events || []).forEach((event, index) => { const article = articles[index]; if (!article || article.querySelector('[data-event-time]')) return; const endsAt = timeValue(event.endsAt); const remaining = Math.max(0, Math.ceil((endsAt - currentTime(view)) / 60000)); const timer = document.createElement('small'); timer.className = 'realm-event-time'; timer.dataset.eventTime = 'true'; timer.textContent = remaining ? '本轮剩余约 ' + remaining + ' 分钟' : '本轮即将结束'; article.append(timer); });
  (data.events || []).forEach((event, index) => {
    if (!Number.isSafeInteger(event.q) || !Number.isSafeInteger(event.r)) return;
    const article = articles[index];
    if (!article || article.querySelector('[data-event-jump]')) return;
    const button = document.createElement('button');
    button.className = 'btn secondary';
    button.dataset.eventJump = 'true';
    button.textContent = '前往异动';
    button.onclick = () => loadRealmViewport(view, event.q, event.r);
    article.append(button);
  });
}

function bindWorldBossLocation(view, data) {
  // 为世界首领面板添加一键前往坐标按钮
  const boss = data.worldBoss; const panel = view.querySelector('.realm-world-boss');
  if (!boss || !panel || !Number.isSafeInteger(boss.q) || !Number.isSafeInteger(boss.r) || panel.querySelector('[data-boss-jump]')) return;
  const attack = panel.querySelector('[data-boss-attack]'); if (!attack) return;
  const button = document.createElement('button'); button.className = 'btn secondary'; button.dataset.bossJump = 'true'; button.textContent = '前往首领'; button.onclick = () => loadRealmViewport(view, boss.q, boss.r); const endAt = timeValue(boss.endsAt); const remaining = Math.max(0, Math.ceil((endAt - currentTime(view)) / 60000)); const timer = document.createElement('small'); timer.dataset.bossTime = 'true'; timer.textContent = remaining ? '本场剩余约 ' + remaining + ' 分钟' : '本场即将结束'; const phase = boss.phase?.damageMultiplier < 1 ? document.createElement('small') : null; if (phase) { phase.className = 'realm-boss-phase'; phase.textContent = '当前阶段首领承受伤害 ' + Math.round(boss.phase.damageMultiplier * 100) + '%'; panel.insertBefore(phase, attack); } const rank = boss.personal?.rank ? document.createElement('small') : null; if (rank) { rank.className = 'realm-boss-personal-rank'; rank.textContent = '你的当前排名：第 ' + boss.personal.rank + ' 名'; panel.insertBefore(rank, attack); } panel.insertBefore(timer, attack); panel.insertBefore(button, attack);
}

function dailyQuestRewardText(reward) {
  // 将每日悬赏奖励转换为玩家可读的短文本
  return ['grain', 'wood', 'ore', 'essence'].map((key, index) => Number(reward?.[key] || 0) ? ['粮', '木', '矿', '灵'][index] + reward[key] : '').concat(Number(reward?.cultivationExp || 0) ? '修炼经验' + reward.cultivationExp : '').filter(Boolean).join(' · ');
}

function renderDailyQuests(view, data) {
  // 展示每日悬赏进度并绑定奖励领取操作
  view.querySelector('.realm-daily-quests')?.remove(); const panel = document.createElement('section'); panel.className = 'realm-daily-quests'; const quests = data.dailyQuests || []; panel.innerHTML = '<h2>每日悬赏</h2>' + quests.map(quest => { const done = quest.progress >= quest.goal; const status = quest.claimed ? '已领取' : done ? '可领取' : quest.progress + '/' + quest.goal; return '<div class="realm-daily-quest"><strong>' + escape(quest.name) + '</strong><small>' + escape(quest.description) + ' · ' + status + '</small><small>奖励：' + escape(dailyQuestRewardText(quest.reward)) + '</small>' + (done && !quest.claimed ? '<button class="btn secondary" data-quest="' + escape(quest.key) + '">领取奖励</button>' : '') + '</div>'; }).join(''); insertRealmSidePanel(view, panel); panel.querySelectorAll('[data-quest]').forEach(button => { button.onclick = () => operate(view, '/realm/daily-quests/claim', { questKey: button.dataset.quest }, '每日悬赏奖励已领取'); });
}

function renderTradeMarket(view, data) {
  // 展示玩家间托管订单并绑定挂单、成交和取消操作
  view.querySelector('.realm-trade')?.remove(); const labels = { grain: '粮食', wood: '木材', ore: '矿石', essence: '灵息' }; const panel = document.createElement('section'); panel.className = 'realm-trade'; const orders = data.tradeOrders || []; const list = orders.length ? orders.map(order => { const own = order.seller === data.player.userName; const action = own ? '<button class="btn danger" data-trade-cancel="' + order.id + '">取消并退款</button>' : '<button class="btn secondary" data-trade-fill="' + order.id + '">成交</button>'; return '<div class="realm-trade-order"><strong>' + escape(order.seller) + '</strong><small>出 ' + order.offerAmount + ' ' + labels[order.offerResource] + '，换 ' + order.wantAmount + ' ' + labels[order.wantResource] + ' · 有效至 ' + escape(order.expiresAt || '24小时') + '</small>' + action + '</div>'; }).join('') : '<small>当前没有公开交易订单</small>'; panel.innerHTML = '<h2>交易所</h2><div class="realm-trade-form"><select name="offerResource"><option value="grain">出售粮食</option><option value="wood">出售木材</option><option value="ore">出售矿石</option><option value="essence">出售灵息</option></select><input name="offerAmount" type="number" min="1" placeholder="出售数量"><select name="wantResource"><option value="wood">换取木材</option><option value="grain">换取粮食</option><option value="ore">换取矿石</option><option value="essence">换取灵息</option></select><input name="wantAmount" type="number" min="1" placeholder="换取数量"><button class="btn secondary" data-trade-create>发布订单</button></div><div class="realm-trade-orders">' + list + '</div>'; insertRealmSidePanel(view, panel); panel.querySelector('[data-trade-create]').onclick = () => operate(view, '/realm/trades', { offerResource: panel.querySelector('[name="offerResource"]').value, offerAmount: Number(panel.querySelector('[name="offerAmount"]').value), wantResource: panel.querySelector('[name="wantResource"]').value, wantAmount: Number(panel.querySelector('[name="wantAmount"]').value) }, '交易订单已发布'); panel.querySelectorAll('[data-trade-fill]').forEach(button => button.onclick = () => operate(view, '/realm/trades/fill', { orderId: Number(button.dataset.tradeFill) }, '交易已成交')); panel.querySelectorAll('[data-trade-cancel]').forEach(button => button.onclick = () => operate(view, '/realm/trades/cancel', { orderId: Number(button.dataset.tradeCancel) }, '订单已取消并退款'));
}

function eventCostText(cost) {
  // 将分支事件的资源消耗转换为按钮提示
  const labels = { grain: '粮', wood: '木', ore: '矿', essence: '灵' }; return Object.entries(cost || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => labels[key] + value).join(' · ');
}

function resourceText(cost) {
  // 将建筑成本转换为统一的资源提示
  const labels = { grain: '粮', wood: '木', ore: '矿', essence: '灵' }; return Object.entries(cost || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => labels[key] + value).join(' · ') || '无消耗';
}

function eventRewardText(reward) {
  // 将事件奖励转换为玩家可比较的短文本
  const labels = { grain: '粮', wood: '木', ore: '矿', essence: '灵', cultivationExp: '修炼经验' }; return Object.entries(reward || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => labels[key] + value).join(' · ');
}

function gatherRewardText(reward) {
  // 将本次主动采集的资源增量转换为提示文本
  return [['grain', '粮'], ['wood', '木'], ['ore', '矿'], ['essence', '灵']].map(([key, label]) => label + Number(reward?.[key] || 0)).join(' · ');
}

function renderTalent(view, data) {
  // 展示灵根、功法和联盟战争面板
  view.querySelector('.realm-talent')?.remove(); view.querySelector('.realm-technique')?.remove(); const side = view.querySelector('.realm-side'); const panel = document.createElement('section'); panel.className = 'realm-talent'; const selected = data.talents.find(item => item.key === data.player.talent); if (selected) panel.innerHTML = '<h2>灵根道途</h2><strong>' + escape(selected.name) + '</strong><small>' + escape(selected.description) + '</small>'; else { panel.innerHTML = '<h2>灵根觉醒</h2><small>选择一次修炼路线，觉醒后不可更改</small><div>' + data.talents.map(item => '<button class="btn secondary" data-talent="' + escape(item.key) + '">' + escape(item.name) + '</button><small>' + escape(item.description) + '</small>').join('') + '</div>'; panel.querySelectorAll('[data-talent]').forEach(button => { button.onclick = () => operate(view, '/realm/talent', { talent: button.dataset.talent }, '灵根觉醒完成'); }); } insertRealmSidePanel(view, panel); const techniquePanel = document.createElement('section'); techniquePanel.className = 'realm-technique'; const learned = data.techniques.find(item => item.key === data.player.technique); if (learned) { const level = data.player.techniqueLevel || 0; const upgrade = data.techniqueUpgrade; const upgradeCost = upgrade ? '<small>升至 ' + upgrade.level + ' 级需要修炼经验 ' + upgrade.cultivationExp + ' · 灵息 ' + upgrade.essence + '</small>' : ''; techniquePanel.innerHTML = '<h2>本命功法</h2><strong>' + escape(learned.name) + ' · ' + level + '级</strong><small>' + escape(learned.description) + '</small>' + upgradeCost + (upgrade ? '<button class="btn secondary" data-technique-upgrade>升级功法</button>' : '<small>已达到当前功法上限</small>'); techniquePanel.querySelector('[data-technique-upgrade]')?.addEventListener('click', () => operate(view, '/realm/technique/upgrade', {}, '功法升级完成')); } else { techniquePanel.innerHTML = '<h2>选择功法</h2><small>功法选择后可以消耗修炼经验和灵息升级</small><div>' + data.techniques.map(item => '<button class="btn secondary" data-technique="' + escape(item.key) + '">' + escape(item.name) + '</button><small>' + escape(item.description) + '</small>').join('') + '</div>'; techniquePanel.querySelectorAll('[data-technique]').forEach(button => { button.onclick = () => operate(view, '/realm/technique', { technique: button.dataset.technique }, '功法入门完成'); }); } insertRealmSidePanel(view, techniquePanel); renderAllianceWars(view, data);
}

function renderAllianceWars(view, data) {
  // 展示联盟战争和盟主宣战入口
  view.querySelector('.realm-wars')?.remove(); if (!data.alliance) return; const panel = document.createElement('section'); panel.className = 'realm-wars'; const wars = data.wars || []; const rewardText = reward => ['grain', 'wood', 'ore', 'essence', 'cultivationExp'].filter(key => Number(reward?.[key]) > 0).map(key => ({ grain: '粮', wood: '木', ore: '矿', essence: '灵', cultivationExp: '修炼经验' }[key] + reward[key])).join(' · '); const list = wars.length ? wars.map(war => { const ownAttacking = war.attackerAllianceId === data.alliance.id; const ownScore = ownAttacking ? war.attackerScore : war.defenderScore; const enemyScore = ownAttacking ? war.defenderScore : war.attackerScore; const status = !war.settledAt ? '进行中' : !war.winnerAllianceId ? '平局' : war.winnerAllianceId === data.alliance.id ? '本盟胜利' : '本盟失利'; const participants = (war.participants || []).map((item, index) => (index + 1) + '. ' + escape(item.userName) + '（' + item.points + '分）').join(' · '); const ownReward = war.ownReward ? '<small>个人结算：第 ' + war.ownReward.rank + ' 名 · ' + rewardText(war.ownReward.reward) + '</small>' : ''; const warehouseReward = war.warehouseReward ? '<small>联盟仓库结算：' + rewardText(war.warehouseReward) + '</small>' : ''; const ownRank = war.ownRank ? '（本盟第 ' + war.ownRank + ' 名）' : ''; return '<div><strong>' + escape(ownAttacking ? war.attackerName : war.defenderName) + ' · ' + escape(ownAttacking ? war.defenderName : war.attackerName) + '</strong><small>' + status + ' · 积分 ' + ownScore + ':' + enemyScore + ' · 结束于 ' + escape(war.endsAt) + '</small><small>你的贡献：' + Number(war.ownPoints || 0) + ' 分' + ownRank + '</small>' + warehouseReward + ownReward + (participants ? '<small>本盟参战榜：' + participants + '</small>' : '') + '</div>'; }).join('') : '<small>当前没有联盟战争记录</small>'; const declare = data.alliance.leader === data.player.userName ? '<input name="warTarget" placeholder="目标联盟名称"><button class="btn danger" data-war>宣战</button>' : ''; panel.innerHTML = '<h2>联盟战争</h2>' + list + declare; panel.querySelector('[data-war]')?.addEventListener('click', () => operate(view, '/realm/alliances/war', { targetAlliance: panel.querySelector('[name="warTarget"]').value }, '宣战成功')); insertRealmSidePanel(view, panel);
}

function renderSeason(view, data) {
  // 展示当前世界赛季和剩余时间
  const current = data.season || view._season; if (!current) return; view._season = current; let panel = view.querySelector('.realm-season'); if (!panel) { panel = document.createElement('section'); panel.className = 'realm-season'; view.querySelector('.realm-side').prepend(panel); } const hours = Math.floor(current.remainingSeconds / 3600); const minutes = Math.floor(current.remainingSeconds % 3600 / 60); const previous = current.history?.[0]; const winner = previous?.rankings?.[0]; const cultivationWinner = previous?.cultivationRankings?.[0]; const reward = winner?.seasonReward; const cultivationReward = cultivationWinner?.cultivationReward; const rewardText = reward ? ' · 奖励：粮' + reward.grain + ' 木' + reward.wood + ' 矿' + reward.ore + ' 灵' + reward.essence : ''; const cultivationRewardText = cultivationReward ? ' · 奖励：灵' + cultivationReward.essence + ' 修炼经验' + cultivationReward.cultivationExp : ''; const winnerText = winner ? '<small>上季邑城魁首：' + escape(winner.userName) + ' · ' + winner.territory + ' 地' + rewardText + '</small>' : ''; const cultivationText = cultivationWinner ? '<small>上季修炼魁首：' + escape(cultivationWinner.userName) + ' · ' + escape(data.stages[cultivationWinner.stage]) + ' · ' + cultivationWinner.cultivationExp + ' 经验' + cultivationRewardText + '</small>' : ''; const rankingRows = (items, type) => (items || []).slice(0, 3).map((item, index) => { const rewardData = type === 'territory' ? item.seasonReward : item.cultivationReward; const rewardLabel = rewardData ? (type === 'territory' ? '粮' + rewardData.grain + ' 木' + rewardData.wood + ' 矿' + rewardData.ore + ' 灵' + rewardData.essence : '灵' + rewardData.essence + ' 修' + rewardData.cultivationExp) : ''; const score = type === 'territory' ? item.territory + ' 地' : escape(data.stages[item.stage]) + ' · ' + item.cultivationExp + ' 经验'; return '<div class="realm-season-rank-row"><b>' + (index + 1) + '</b><strong>' + escape(item.userName) + '</strong><span>' + score + '</span>' + (rewardLabel ? '<small>' + rewardLabel + '</small>' : '') + '</div>'; }).join('') || '<small>暂无历史数据</small>'; const history = previous ? '<div class="realm-season-history"><strong>第 ' + previous.seasonNumber + ' 赛季 · 双榜前三</strong><div class="realm-season-ranks"><div><small>邑城榜</small>' + rankingRows(previous.rankings, 'territory') + '</div><div><small>修炼榜</small>' + rankingRows(previous.cultivationRankings, 'cultivation') + '</div></div></div>' : ''; panel.innerHTML = '<strong>第 ' + current.number + ' 赛季</strong><span>本赛季剩余 ' + hours + ' 小时 ' + minutes + ' 分钟</span>' + (winnerText || cultivationText ? winnerText + cultivationText : '<small>首个赛季正在积累历史</small>') + history; panel.querySelector('.realm-season-archive')?.remove(); if ((current.history || []).length > 1) { const archive = document.createElement('details'); archive.className = 'realm-season-archive'; archive.innerHTML = '<summary>查看更早赛季（' + (current.history.length - 1) + ' 届）</summary>' + current.history.slice(1).map(item => { const territory = item.rankings?.[0]; const cultivation = item.cultivationRankings?.[0]; return '<div><strong>第 ' + item.seasonNumber + ' 赛季</strong><small>邑城榜：' + (territory ? escape(territory.userName) + ' · ' + territory.territory + ' 地' : '暂无') + '</small><small>修炼榜：' + (cultivation ? escape(cultivation.userName) + ' · ' + escape(data.stages[cultivation.stage]) + ' · ' + cultivation.cultivationExp + ' 经验' : '暂无') + '</small></div>'; }).join(''); panel.append(archive); } renderTalent(view, data);
}

async function loadRealmViewport(view, q, r) {
  // 只应用最新一次视口请求，避免慢响应覆盖较新的地图位置
  const requestId = (view._viewportRequestId || 0) + 1; view._viewportRequestId = requestId;
  try {
    const data = await api('/realm/overview?q=' + encodeURIComponent(q) + '&r=' + encodeURIComponent(r));
    if (!view.isConnected || requestId !== view._viewportRequestId) return;
    view._centerQ = q; view._centerR = r; view._data = data; renderRealmContent(view);
    if (view._selectedTile) selectTile(view, data, view._selectedTile.q, view._selectedTile.r);
  } catch (error) {
    if (requestId === view._viewportRequestId) failure(error);
  }
}

export async function renderRealm(view) {
  // 加载迩灵邑并绑定视口导航与调试操作
  if (view._realmRefreshTimer) window.clearTimeout(view._realmRefreshTimer);
  view._selectedTile = null;
  view._realmRefreshErrorShown = false;
  const data = await api('/realm/overview'); view._data = data; view._centerQ = data.player.homeQ; view._centerR = data.player.homeR; view.innerHTML = '<div class="realm-layout"><section class="card realm-main"><div class="realm-heading"><div><p class="realm-eyebrow">持续世界 · 六边形邑城</p><h2>迩灵邑</h2><p class="muted">你的邑城会持续积累资源，向相邻荒地扩张，在修炼与建设中成长</p></div><button class="btn secondary" id="realmCollect">采集物资</button></div><div class="realm-stats" id="realmStats"></div><div class="realm-map-wrap"><div class="realm-map" id="realmMap"></div><div class="realm-map-actions"><button class="btn secondary" data-pan="up">北</button><button class="btn secondary" data-pan="left">西</button><button class="btn secondary" data-pan="home">回到邑城</button><button class="btn secondary" data-pan="right">东</button><button class="btn secondary" data-pan="down">南</button></div><form class="realm-map-jump" id="realmMapJump"><label>跳转坐标</label><input name="q" type="number" step="1" required placeholder="q"><input name="r" type="number" step="1" required placeholder="r"><button class="btn secondary" type="submit">查看</button></form></div><div class="realm-selected" id="realmSelected"><span class="muted">点击地图上的地块查看操作</span></div></section><section class="card realm-side"><h2>修炼境界</h2><div class="realm-cultivation" id="realmCultivation"></div><h2>天地异动</h2><div class="realm-events" id="realmEvents"></div><details><summary>调试工具</summary><p class="muted">毁灭世界会清空所有迩灵邑领地、资源和事件，重新生成世界种子</p><button class="btn danger" id="realmDestroy">毁灭世界</button></details></section></div>'; renderRealmContent(view); view.querySelector('#realmCollect').onclick = () => operate(view, '/realm/gather', {}, '资源已收取'); view.querySelectorAll('[data-pan]').forEach(button => { button.onclick = () => { const delta = { up: [0, -4], down: [0, 4], left: [-4, 0], right: [4, 0], home: [view._data.player.homeQ - view._centerQ, view._data.player.homeR - view._centerR] }[button.dataset.pan]; loadRealmViewport(view, view._centerQ + delta[0], view._centerR + delta[1]); }; }); view.querySelector('#realmMapJump').onsubmit = event => { event.preventDefault(); const q = Number(event.currentTarget.q.value); const r = Number(event.currentTarget.r.value); if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) return toast('请输入有效的整数坐标'); loadRealmViewport(view, q, r); }; view.querySelector('#realmDestroy').onclick = async () => { if (!window.confirm('确定要毁灭整个迩灵邑世界吗？此操作不可撤销')) return; await operate(view, '/realm/destroy-world', {}, '世界已重新开始'); };
  // 路由会在 renderRealm 返回后才挂载页面，延后一轮任务再启动同步
  window.setTimeout(() => { if (view.isConnected) scheduleRealmRefresh(view); }, 0);
  return () => {
    // 页面切换时立即终止迩灵邑的定时同步和未完成视口请求
    if (view._realmRefreshTimer) window.clearTimeout(view._realmRefreshTimer);
    view._realmRefreshTimer = null;
    view._viewportRequestId = (view._viewportRequestId || 0) + 1;
  };
}
