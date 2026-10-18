// 路由渲染与页面请求代次校验
import { state } from '../shared/state.js';
import { escape } from '../shared/display.js';
import { busy } from '../shared/interaction.js';
import { lifecycle } from './lifecycle.js';
import { renderWheel } from '../features/wheel/views/page.js';
import { renderOptions } from '../features/options/views/page.js';
import { renderPolls } from '../features/polls/views/page.js';
import { renderSettings } from '../features/settings/views/page.js';
import { renderRecords } from '../features/records/views/page.js';
import { renderMemories } from '../features/memories/views/page.js';
import { renderGame } from '../features/game/views/page.js';
import { renderRealm } from '../features/realm/views/page.js';
let cleanupPage;
export async function renderPage() {
  // 通过独立容器防止旧请求覆盖新页面
  const version = ++lifecycle.generation; const content = document.querySelector('#content');
  cleanupPage?.(); cleanupPage = undefined;
  busy(true);
  document.querySelector('#pageTitle').textContent = state.page;
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === state.page));
  content.innerHTML = '<div class="card muted">正在加载…</div>';
  const view = document.createElement('div');
  try {
    if (state.page === '转盘') await renderWheel(view);
    else if (state.page === '迩灵邑') {
      const realmCleanup = await renderRealm(view);
      if (version === lifecycle.generation) cleanupPage = realmCleanup;
    }
    else if (state.page === '飞机大战') cleanupPage = await renderGame(view);
    else if (state.page === '选项') await renderOptions(view);
    else if (state.page === '投票') await renderPolls(view);
    else if (state.page === '设置') await renderSettings(view);
    else if (state.page === '回忆') await renderMemories(view);
    else await renderRecords(view);
    if (version === lifecycle.generation) content.replaceChildren(view);
  } catch (error) {
    if (version !== lifecycle.generation) return;
    content.innerHTML = '<div class="card"><p>' + escape(error.message) + '</p><button class="btn" id="retry">重新加载</button></div>';
    content.querySelector('#retry').onclick = renderPage;
  } finally { if (version === lifecycle.generation) busy(false); }
}
document.addEventListener('navigate', event => {
  // 所有页面切换经过统一操作锁和状态清理
  if (state.busy) return;
  state.page = event.detail.page; state.pollId = event.detail.pollId; state.offset = event.detail.offset; state.dirty = false; renderPage();
});
