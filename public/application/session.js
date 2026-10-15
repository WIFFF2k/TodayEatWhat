// 编排登录与应用外壳，业务页面由路由模块渲染
import { state } from '../shared/state.js';
import { api } from '../shared/api.js';
import { escape, title } from '../shared/display.js';
import { navigate, busy } from '../shared/interaction.js';
import { lifecycle } from './lifecycle.js';
import { renderPage } from './router.js';
import { sync } from './sync.js';
const app = document.querySelector('#app');
export async function login() {
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
    if (state.busy) return; lifecycle.generation++; state.user = ''; state.dirty = false; localStorage.removeItem('eat-user');
    try { await login(); } catch (error) { showLoadError(error); }
  };
  await renderPage(); await sync();
}
export function showLoadError(error) {
  // 首次加载失败提供明确的重试入口
  app.innerHTML = '<div class="login"><div class="card"><h1>加载失败</h1><p>' + escape(error.message) + '</p><button class="btn" id="retryLogin">重新加载</button></div></div>';
  document.querySelector('#retryLogin').onclick = () => login().catch(showLoadError);
}
