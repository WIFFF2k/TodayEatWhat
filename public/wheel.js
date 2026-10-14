// 绘制有名称的转盘并保证指针与服务端抽签结果一致
import { state, api, post, escape, busy, toast, failure, navigate } from './shared.js';
const colors = ['#4d96ff','#ffb457','#5fc5a0','#ef7c97','#8d7fea','#f28e64'];
export async function renderWheel(view) {
  // 根据最新共享选项构建抽签界面
  state.options = await api('/options');
  view.innerHTML = '<div class="card"><div class="row"><label for="category">用餐方式</label><select id="category"><option value="外卖">点外卖</option><option>出去吃</option></select><span id="wheelCount" class="muted"></span></div><div class="wheel-box"><span class="pointer" aria-hidden="true">▼</span><canvas id="wheel" width="720" height="720" aria-label="餐厅转盘"></canvas><button class="btn" id="spin">开始转盘</button></div><div id="result" aria-live="polite"></div><details><summary>查看转盘全部选项</summary><ol id="wheelNames"></ol></details></div>';
  view.querySelector('#category').value = state.category;
  drawAvailable(view); renderResult(view);
  view.querySelector('#category').onchange = event => { state.category = event.target.value; state.lastSpin = null; drawAvailable(view); renderResult(view); };
  view.querySelector('#spin').onclick = () => spin(view);
}
function draw(canvas, entries) {
  // 按同一角度规则绘制扇区和名称，长名称分行显示
  const ctx = canvas.getContext('2d'); const count = entries.length;
  ctx.clearRect(0, 0, 720, 720);
  if (!count) { ctx.fillStyle = '#dce5f0'; ctx.beginPath(); ctx.arc(360,360,350,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#334155'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('请先启用选项',360,370); return; }
  for (let index = 0; index < count; index++) {
    const angle = Math.PI * 2 / count; const start = -Math.PI / 2 + index * angle;
    ctx.beginPath(); ctx.moveTo(360,360); ctx.arc(360,360,350,start,start+angle); ctx.closePath(); ctx.fillStyle = colors[index % colors.length]; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.save(); ctx.translate(360,360); ctx.rotate(start + angle / 2); ctx.textAlign = 'center'; ctx.fillStyle = '#152238'; ctx.font = 'bold ' + (count > 12 ? 16 : 23) + 'px sans-serif';
    const label = count > 18 ? String(index + 1) : entries[index].name;
    const chunks = label.match(/.{1,8}/gu);
    chunks.forEach((chunk, line) => ctx.fillText(chunk, 224, (line - (chunks.length - 1) / 2) * 26, 210)); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(360,360,44,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
}
function drawAvailable(view) {
  // 保留上次抽签快照与落点，新候选仅用于下一次抽签
  const entries = state.options.filter(item => item.enabled && item.category === state.category);
  const canvas = view.querySelector('#wheel'); const last = state.lastSpin;
  canvas.style.transform = 'rotate(' + (last ? landing(last) : 0) + 'deg)'; draw(canvas, last ? last.entries : entries);
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
  const oldPollButton = view.querySelector('#createPoll'); if (oldPollButton) oldPollButton.disabled = true;
  try {
    const result = await post('/spins', { category: state.category }); const canvas = view.querySelector('#wheel');
    draw(canvas, result.entries);
    const targetAngle = landing(result);
    canvas.style.transform = 'rotate(0deg)';
    const animation = canvas.animate([{ transform:'rotate(0deg)' }, { transform:'rotate(' + targetAngle + 'deg)' }], { duration: 3200, easing:'cubic-bezier(.15,.75,.18,1)', fill:'forwards' });
    await animation.finished; canvas.style.transform = 'rotate(' + targetAngle + 'deg)'; animation.cancel();
    state.lastSpin = result; canvas.dataset.winnerIndex = result.index; canvas.dataset.angle = targetAngle; renderResult(view);
  } catch (error) { failure(error); }
  finally { busy(false); button.disabled = false; category.disabled = false; if (oldPollButton) oldPollButton.disabled = false; }
}
