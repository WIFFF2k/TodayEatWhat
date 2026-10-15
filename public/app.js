// 装配登录、页面切换和跨设备状态同步
import { state, api, escape, title, time, ago, busy, navigate } from './shared.js';
import { renderWheel, updateWheel } from './wheel.js';
import { renderOptions, updateOptions } from './options.js';
import { renderPolls, updatePoll } from './polls.js';
import { renderSettings } from './settings.js';
const app = document.querySelector('#app');
let generation = 0; let syncing = false;
async function login() {
  // 读取白名单，失效的本地姓名回到选择页
  const bootstrap = await api('/bootstrap');
  state.serverOffset = bootstrap.serverTime - Date.now();
  state.title = bootstrap.title;
  document.title = title();
  if (state.user && bootstrap.users.includes(state.user)) return shell();
  state.user = ''; localStorage.removeItem('eat-user');
  app.innerHTML = '<div class="login"><form class="card login-card" id="loginForm"><h1>' + title() + '</h1><p class="muted">打死不去西一吃</p><select id="loginName" required><option value="">请选择姓名</option>' + bootstrap.users.map(name => '<option>' + escape(name) + '</option>').join('') + '</select><button class="btn" type="submit">进入</button></form></div>';
  document.querySelector('#loginForm').onsubmit = async event => {
    // 姓名选择成功后保存身份并进入主页
    event.preventDefault(); state.user = document.querySelector('#loginName').value;
    localStorage.setItem('eat-user', state.user);
    try { await shell(); } catch (error) { showLoadError(error); }
  };
}
async function shell() {
  // 构建稳定侧栏，数据刷新只更新当前内容区域
  state.page = '转盘'; state.pollId = null; state.lastSpin = null;
  app.innerHTML = '<div class="shell"><aside><div class="brand" data-title></div><div class="muted">201 · 今天一起吃</div><nav>' + ['转盘','选项','投票','记录','设置'].map(page => '<button data-page="' + page + '">' + page + '</button>').join('') + '</nav></aside><main><header><h1 id="pageTitle"></h1><div class="row"><span>' + escape(state.user) + '</span><button class="btn secondary" id="switch">切换姓名</button></div></header><div id="connection" role="status"></div><div id="notifications"></div><section id="content"></section></main></div>';
  document.querySelectorAll('[data-page]').forEach(button => { button.onclick = () => navigate(button.dataset.page); });
  document.querySelector('[data-title]').textContent = title();
  document.querySelector('#switch').onclick = async () => {
    // 切换姓名时废弃旧页面请求并回到白名单入口
    if (state.busy) return; generation++; state.user = ''; state.dirty = false; localStorage.removeItem('eat-user');
    try { await login(); } catch (error) { showLoadError(error); }
  };
  await renderPage(); await sync();
}
async function renderPage() {
  // 通过独立容器防止旧请求覆盖新页面
  const version = ++generation; const content = document.querySelector('#content');
  busy(true);
  document.querySelector('#pageTitle').textContent = state.page;
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === state.page));
  content.innerHTML = '<div class="card muted">正在加载…</div>';
  const view = document.createElement('div');
  try {
    if (state.page === '转盘') await renderWheel(view);
    else if (state.page === '选项') await renderOptions(view);
    else if (state.page === '投票') await renderPolls(view);
    else if (state.page === '设置') await renderSettings(view);
    else await records(view);
    if (version === generation) content.replaceChildren(view);
  } catch (error) {
    if (version !== generation) return;
    content.innerHTML = '<div class="card"><p>' + escape(error.message) + '</p><button class="btn" id="retry">重新加载</button></div>';
    content.querySelector('#retry').onclick = renderPage;
  } finally { if (version === generation) busy(false); }
}
async function records(view) {
  // 展示完整分页抽签记录与关联投票
  const rows = await api('/records?offset=' + state.offset);
  view.innerHTML = '<div class="card"><h2>转盘历史</h2><div class="list">' + (rows.length ? rows.map(row => '<div class="record"><div><strong>' + escape(row.optionName) + '</strong><small>' + escape(row.category) + ' · ' + escape(row.userName) + ' · ' + time(row.createdAt) + '</small></div>' + (row.pollId ? '<button class="btn secondary" data-poll="' + row.pollId + '">查看投票</button>' : '') + '</div>').join('') : '<p class="muted">还没有转盘记录</p>') + '</div><div class="row pager"><button class="btn secondary" id="prev" ' + (state.offset === 0 ? 'disabled' : '') + '>上一页</button><span>第 ' + (state.offset / 30 + 1) + ' 页</span><button class="btn secondary" id="next" ' + (rows.length < 30 ? 'disabled' : '') + '>下一页</button></div></div>';
  view.querySelectorAll('[data-poll]').forEach(button => { button.onclick = () => navigate('投票', Number(button.dataset.poll)); });
  view.querySelector('#prev').onclick = () => { state.offset -= 30; renderPage(); };
  view.querySelector('#next').onclick = () => { state.offset += 30; renderPage(); };
}
async function sync() {
  // 每三秒同步通知与当前页共享数据，不覆盖未提交表单
  if (!state.user || syncing || state.busy || document.hidden || !document.querySelector('#notifications')) return;
  syncing = true; const version = generation;
  try {
    const data = await api('/sync'); if (version !== generation || state.busy) return;
    state.serverOffset = data.serverTime - Date.now(); state.title = data.title; document.title = data.title;
    document.querySelectorAll('[data-title]').forEach(node => { node.textContent = data.title; });
    const notifications = document.querySelector('#notifications');
    notifications.innerHTML = data.activePolls.filter(p => !p.votedChoiceIds.length).map(p => '<button class="notice" data-notification="' + p.id + '"><strong>' + escape(p.creator) + '</strong> · ' + ago(p.createdAt) + '发起了「' + escape(p.title) + '」' + (p.proposedName ? '，转到了 ' + escape(p.proposedName) : '') + '<span>点击参与 →</span></button>').join('');
    notifications.querySelectorAll('[data-notification]').forEach(button => { button.onclick = () => navigate('投票', Number(button.dataset.notification)); });
    if (state.page === '转盘' || state.page === '选项') {
      const options = await api('/options'); if (version !== generation || state.busy) return;
      if (JSON.stringify(options) !== JSON.stringify(state.options)) {
        state.options = options;
        if (state.page === '转盘') updateWheel();
      }
      if (state.page === '选项') await updateOptions(() => version === generation);
    } else if (state.page === '投票') { await updatePoll(() => version === generation); }
    const status = document.querySelector('#connection'); if (status) status.textContent = '';
  } catch (error) {
    if (version === generation) { const status = document.querySelector('#connection'); if (status) status.textContent = error.message; }
  } finally { syncing = false; }
}
function showLoadError(error) {
  // 首次加载失败提供明确的重试入口
  app.innerHTML = '<div class="login"><div class="card"><h1>加载失败</h1><p>' + escape(error.message) + '</p><button class="btn" id="retryLogin">重新加载</button></div></div>';
  document.querySelector('#retryLogin').onclick = () => login().catch(showLoadError);
}
document.addEventListener('navigate', event => {
  // 所有页面切换经过统一操作锁和状态清理
  if (state.busy) return;
  state.page = event.detail.page; state.pollId = event.detail.pollId; state.offset = event.detail.offset; state.dirty = false; renderPage();
});
setInterval(sync, 3000);
login().catch(showLoadError);
