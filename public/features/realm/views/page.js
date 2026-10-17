// 渲染迩灵邑六边形地图、资源面板和修炼操作
import { api, post } from '../../../shared/api.js';
import { escape } from '../../../shared/display.js';
import { busy, failure, toast } from '../../../shared/interaction.js';
const TERRAIN = { 平原: '平', 古林: '林', 矿脉: '矿', 灵泉: '泉', 遗迹: '迹' };

function tileLabel(tile) {
  // 生成地块按钮上的简短标识
  return tile.owner ? (tile.building === 'town' ? '邑' : tile.building ? '建' : '领') : TERRAIN[tile.terrain] || '野';
}

function renderTiles(view, data, centerQ, centerR) {
  // 按轴向坐标绘制固定视口的六边形地块
  const map = view.querySelector('#realmMap'); const byKey = new Map(data.tiles.map(item => [item.q + ',' + item.r, item])); const buttons = [];
  for (let q = centerQ - 4; q <= centerQ + 4; q += 1) for (let r = centerR - 4; r <= centerR + 4; r += 1) { if (Math.abs(q - centerQ) + Math.abs(q + r - centerQ - centerR) + Math.abs(r - centerR) > 8) continue; const tile = byKey.get(q + ',' + r) || { q, r, terrain: '平原' }; buttons.push('<button class="realm-hex terrain-' + escape(tile.terrain) + ' ' + (tile.owner ? 'owned' : '') + '" data-q="' + q + '" data-r="' + r + '" title="坐标 ' + q + ',' + r + ' · ' + escape(tile.terrain) + '"><span>' + tileLabel(tile) + '</span><small>' + q + ',' + r + '</small></button>'); }
  map.innerHTML = buttons.join(''); map.querySelectorAll('.realm-hex').forEach(button => { button.onclick = () => selectTile(view, data, Number(button.dataset.q), Number(button.dataset.r)); });
}

function selectTile(view, data, q, r) {
  // 显示选中地块的操作面板
  const tile = data.tiles.find(item => item.q === q && item.r === r) || { q, r, terrain: '平原' }; const panel = view.querySelector('#realmSelected'); const own = tile.owner === data.player.userName; const buildButtons = data.buildings.map(item => '<button class="btn secondary" data-build="' + escape(item.key) + '">修建' + escape(item.name) + '</button>').join(''); panel.innerHTML = '<strong>地块 ' + q + ',' + r + '</strong><span>' + escape(tile.terrain) + (tile.building ? ' · ' + escape(tile.building) + ' · '+tile.level+'级' : '') + '</span>' + (tile.owner ? '<small>归属：' + escape(tile.owner) + '</small>' : '<small>尚未归属</small>') + (own && !tile.building ? buildButtons : '') + (own && tile.building && tile.building !== 'town' ? '<button class="btn" data-upgrade>升级建筑</button>' : '') + (!tile.owner ? '<button class="btn" data-claim>圈占此地</button>' : '') + (tile.owner && !own ? '<button class="btn danger" data-attack>发起攻击</button>' : ''); panel.querySelector('[data-claim]')?.addEventListener('click', () => operate(view, '/realm/tiles/claim', { q, r }, '地块已纳入邑城')); panel.querySelectorAll('[data-build]').forEach(button => button.addEventListener('click', () => operate(view, '/realm/buildings', { q, r, building: button.dataset.build }, '建筑已建成'))); panel.querySelector('[data-upgrade]')?.addEventListener('click', () => operate(view, '/realm/buildings/upgrade', { q, r }, '建筑已升级')); panel.querySelector('[data-attack]')?.addEventListener('click', () => operate(view, '/realm/attack', { q, r }, '攻击行动已结算'));
}

async function operate(view, url, body, message) {
  // 执行地图操作并刷新当前视口
  if (view._busy) return; view._busy = true; busy(true); try { const data = await post(url, body); view._data = data; view._centerQ = data.player.homeQ; view._centerR = data.player.homeR; renderRealmContent(view); toast(message); } catch (error) { failure(error); } finally { view._busy = false; busy(false); }
}

function renderRealmContent(view) {
  // 更新资源、地图、修炼和事件展示
  if (!view.querySelector('.realm-donate')) bindDonation(view);
  const data = view._data; const player = data.player; view.querySelector('#realmStats').innerHTML = '<span>粮食 ' + player.grain + '</span><span>木材 ' + player.wood + '</span><span>矿石 ' + player.ore + '</span><span>灵息 ' + player.essence + '</span>'; view.querySelector('#realmCultivation').innerHTML = '<strong>' + escape(data.stages[player.stage]) + ' · ' + escape(data.phases[player.phase]) + '</strong><span>修炼经验 ' + player.cultivationExp + '</span><span>共同活动 ' + data.activities.total + ' 次（吃饭 ' + data.activities.meals + ' · 发帖 ' + data.activities.posts + '）</span><button class="btn" id="realmCultivate">静心修炼</button><button class="btn secondary" id="realmBreakthrough">尝试突破</button>'; view.querySelector('#realmCultivate').onclick = () => operate(view, '/realm/cultivate', {}, '修炼完成，境界经验增加'); view.querySelector('#realmBreakthrough').onclick = () => operate(view, '/realm/breakthrough', {}, '突破结果已结算'); renderTiles(view, data, view._centerQ, view._centerR); view.querySelector('#realmEvents').innerHTML = data.events.length ? data.events.map(event => '<article><strong>' + escape(event.title) + '</strong><p>' + escape(event.description) + '</p></article>').join('') : '<p class="muted">这片天地暂时风平浪静</p>';
}

function bindDonation(view) {
  // 添加向其他玩家捐赠粮食的操作面板
  const side = view.querySelector('.realm-side'); const form = document.createElement('form'); form.className = 'realm-donate'; form.innerHTML = '<h2>物资援助</h2><input name="recipient" required placeholder="玩家姓名"><input name="amount" type="number" min="1" required placeholder="粮食数量"><button class="btn" type="submit">捐赠粮食</button>'; side.insertBefore(form, side.querySelector('details')); form.onsubmit = async event => { event.preventDefault(); await operate(view, '/realm/donate', { recipient: form.recipient.value, amount: Number(form.amount.value) }, '捐赠已送达'); form.reset(); };
}

export async function renderRealm(view) {
  // 加载迩灵邑并绑定视口导航与调试操作
  const data = await api('/realm/overview'); view._data = data; view._centerQ = data.player.homeQ; view._centerR = data.player.homeR; view.innerHTML = '<div class="realm-layout"><section class="card realm-main"><div class="realm-heading"><div><p class="realm-eyebrow">持续世界 · 六边形邑城</p><h2>迩灵邑</h2><p class="muted">你的邑城会持续积累资源，向相邻荒地扩张，在修炼与建设中成长</p></div><button class="btn secondary" id="realmCollect">采集灵气</button></div><div class="realm-stats" id="realmStats"></div><div class="realm-map-wrap"><div class="realm-map" id="realmMap"></div><div class="realm-map-actions"><button class="btn secondary" data-pan="up">北</button><button class="btn secondary" data-pan="left">西</button><button class="btn secondary" data-pan="home">回到邑城</button><button class="btn secondary" data-pan="right">东</button><button class="btn secondary" data-pan="down">南</button></div></div><div class="realm-selected" id="realmSelected"><span class="muted">点击地图上的地块查看操作</span></div></section><section class="card realm-side"><h2>修炼境界</h2><div class="realm-cultivation" id="realmCultivation"></div><h2>天地异动</h2><div class="realm-events" id="realmEvents"></div><details><summary>调试工具</summary><p class="muted">毁灭世界会清空所有迩灵邑领地、资源和事件，重新生成世界种子</p><button class="btn danger" id="realmDestroy">毁灭世界</button></details></section></div>'; renderRealmContent(view); view.querySelector('#realmCollect').onclick = () => operate(view, '/realm/overview?q=' + view._centerQ + '&r=' + view._centerR, {}, '资源已收取'); view.querySelectorAll('[data-pan]').forEach(button => { button.onclick = async () => { const delta = { up: [0, -4], down: [0, 4], left: [-4, 0], right: [4, 0], home: [view._data.player.homeQ - view._centerQ, view._data.player.homeR - view._centerR] }[button.dataset.pan]; view._centerQ += delta[0]; view._centerR += delta[1]; view._data = await api('/realm/overview?q=' + view._centerQ + '&r=' + view._centerR); renderRealmContent(view); }; }); view.querySelector('#realmDestroy').onclick = async () => { if (!window.confirm('确定要毁灭整个迩灵邑世界吗？此操作不可撤销')) return; await operate(view, '/realm/destroy-world', {}, '世界已重新开始'); };
}
