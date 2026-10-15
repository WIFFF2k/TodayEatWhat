// 绘制有名称的转盘并保证指针与服务端抽签结果一致
import { state, api, post, escape, busy, toast, failure, navigate } from './shared.js';
import { drawWheel, selectedSkin, reducedMotion, celebrate, clearCelebration } from './wheel-visuals.js';
export async function renderWheel(view) {
  // 根据最新共享选项构建抽签界面
  state.options = await api('/options');
  view.innerHTML = '<div class="card wheel-card"><div class="row wheel-toolbar"><div class="row"><label for="category">用餐方式</label><select id="category"><option value="外卖">点外卖</option><option>出去吃</option></select><span id="wheelCount" class="muted"></span></div><div class="skin-control"><label for="wheelSkin">转盘皮肤</label><select id="wheelSkin"><option value="basic">基础皮肤</option><option value="neon">霓虹宇宙 ✦</option></select></div></div><div class="neon-intro"><span class="eyebrow">201 · 味觉探索计划</span><h2>让宇宙决定这一餐</h2><p>启动能量 · 捕获今天的美味坐标</p></div><div class="wheel-box"><span class="pointer" aria-hidden="true">▼</span><div class="wheel-stage"><span class="wheel-ring ring-outer" aria-hidden="true"></span><span class="wheel-ring ring-inner" aria-hidden="true"></span><canvas id="wheel" width="720" height="720" aria-label="餐厅转盘"></canvas><span class="wheel-core" aria-hidden="true">201</span><div class="wheel-particles" aria-hidden="true"></div></div><span class="neon-caption">每一份期待，都有相同的机会</span><button class="btn" id="spin">开始转盘</button><div class="wheel-status" role="status">能量就绪，等待启航</div></div><div id="result" aria-live="polite"></div><details><summary>查看转盘全部选项</summary><ol id="wheelNames"></ol></details></div>';
  view = view.querySelector('.wheel-card');
  view.dataset.skin = selectedSkin(); view.querySelector('#wheelSkin').value = view.dataset.skin;
  view.querySelector('#category').value = state.category;
  view.querySelector('#wheelSkin').onchange = event => {
    // 皮肤只改变外观，保留候选和结果快照
    if (state.busy) return;
    localStorage.setItem('eat-wheel-skin',event.target.value); view.dataset.skin=event.target.value;
    clearCelebration(view); drawAvailable(view); renderResult(view);
  };
  drawAvailable(view); renderResult(view);
  view.querySelector('#category').onchange = event => { state.category = event.target.value; state.lastSpin = null; drawAvailable(view); renderResult(view); };
  view.querySelector('#spin').onclick = () => spin(view);
}
function drawAvailable(view) {
  // 保留上次抽签快照与落点，新候选仅用于下一次抽签
  const entries = state.options.filter(item => item.enabled && item.category === state.category);
  const canvas = view.querySelector('#wheel'); const last = state.lastSpin;
  canvas.style.transform = 'rotate(' + (last ? landing(last) : 0) + 'deg)'; drawWheel(canvas, last ? last.entries : entries, view.dataset.skin);
  view.querySelector('#wheelCount').textContent = entries.length + ' 项已启用 · 等概率抽取' + (last ? ' · 盘面保留上次结果' : '');
  view.querySelector('#wheelNames').innerHTML = entries.map(item => '<li>' + escape(item.name) + '</li>').join('');
  view.querySelector('#spin').disabled = !entries.length;
}
export function updateWheel() {
  // 后台同步仅更新候选，不清除已保存的抽签结果
  const view = document.querySelector('#wheel')?.closest('.card');
  if (view && !state.busy) drawAvailable(view);
}
function renderResult(view) {
  // 结果独立于画布显示并允许从该记录发起投票
  const target = view.querySelector('#result'); const result = state.lastSpin;
  target.innerHTML = result ? '<div class="result"><div><small>这次就吃</small><strong>' + escape(result.winner.name) + '</strong></div><button id="createPoll" class="btn secondary">发起投票</button></div>' : '';
  target.innerHTML = result ? '<div class="result"><div><strong>' + escape(result.winner.name) + '</strong></div><button id="createPoll" class="btn secondary">发起投票</button></div>' : '';
  if (!result) return;
  target.querySelector('#createPoll').onclick = async () => {
    // 禁止重复提交，服务端同时保证同一抽签只建立一个投票
    if (state.busy) return;
    const button = target.querySelector('#createPoll'); button.disabled = true; busy(true);
    let poll;
    try { poll = await post('/polls', { spinId: result.id }); }
    catch (error) { failure(error); } finally { busy(false); button.disabled = false; }
    if (poll) { navigate('投票', poll.id); toast('投票已发起'); }
  };
}
function landing(result) {
  // 中奖扇区中心旋转到正上方指针位置
  return 360 * 5 + 360 - (result.index + 0.5) * 360 / result.entries.length;
}
async function spin(view) {
  // 先取得已入库结果，再播放精确落在中奖扇区的动画
  if (state.busy) return; busy(true);
  const button = view.querySelector('#spin'); const category = view.querySelector('#category'); button.disabled = true; category.disabled = true;
  const skin=view.querySelector('#wheelSkin'); skin.disabled=true; clearCelebration(view); view.classList.add('is-spinning');
  view.querySelector('.wheel-status').textContent='正在连接美味星系…';
  const oldPollButton = view.querySelector('#createPoll'); if (oldPollButton) oldPollButton.disabled = true;
  try {
    const result = await post('/spins', { category: state.category }); const canvas = view.querySelector('#wheel');
    drawWheel(canvas, result.entries, view.dataset.skin);
    view.querySelector('.wheel-status').textContent='能量流转中 · 即将锁定美味';
    const targetAngle = landing(result);
    canvas.style.transform = 'rotate(0deg)';
    const animation = canvas.animate([{ transform:'rotate(0deg)' }, { transform:'rotate(' + targetAngle + 'deg)' }], { duration: reducedMotion() ? 120 : view.dataset.skin === 'neon' ? 4200 : 3200, easing:'cubic-bezier(.15,.75,.18,1)', fill:'forwards' });
    await animation.finished; canvas.style.transform = 'rotate(' + targetAngle + 'deg)'; animation.cancel();
    state.lastSpin = result; canvas.dataset.winnerIndex = result.index; canvas.dataset.angle = targetAngle; renderResult(view);
    view.querySelector('.wheel-status').textContent='坐标已锁定 · 美味降临'; celebrate(view);
  } catch (error) { view.querySelector('.wheel-status').textContent='启航未完成，请重试'; failure(error); }
  finally { view.classList.remove('is-spinning'); busy(false); category.disabled=false; skin.disabled=false; drawAvailable(view); if (oldPollButton) oldPollButton.disabled=false; }
}
