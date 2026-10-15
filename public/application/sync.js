// 同步当前页共享数据并保护正在编辑的草稿
import { state } from '../shared/state.js';
import { api } from '../shared/api.js';
import { escape, ago } from '../shared/display.js';
import { navigate } from '../shared/interaction.js';
import { lifecycle } from './lifecycle.js';
import { updateWheel } from '../features/wheel/views/page.js';
import { updateOptions } from '../features/options/views/page.js';
import { updatePoll } from '../features/polls/components/detail.js';
let syncing = false;
export async function sync() {
  // 每三秒同步通知与当前页共享数据，不覆盖未提交表单
  if (!state.user || syncing || state.busy || document.hidden || !document.querySelector('#notifications')) return;
  syncing = true; const version = lifecycle.generation;
  try {
    const data = await api('/sync'); if (version !== lifecycle.generation || state.busy) return;
    state.serverOffset = data.serverTime - Date.now(); state.title = data.title; document.title = data.title;
    document.querySelectorAll('[data-title]').forEach(node => { node.textContent = data.title; });
    const notifications = document.querySelector('#notifications');
    notifications.innerHTML = data.activePolls.filter(p => !p.votedChoiceIds.length).map(p => '<button class="notice" data-notification="' + p.id + '"><strong>' + escape(p.creator) + '</strong> · ' + ago(p.createdAt) + '发起了「' + escape(p.title) + '」' + (p.proposedName ? '，转到了 ' + escape(p.proposedName) : '') + '<span>点击参与 →</span></button>').join('');
    notifications.querySelectorAll('[data-notification]').forEach(button => { button.onclick = () => navigate('投票', Number(button.dataset.notification)); });
    if (state.page === '转盘' || state.page === '选项') {
      const options = await api('/options'); if (version !== lifecycle.generation || state.busy) return;
      if (JSON.stringify(options) !== JSON.stringify(state.options)) {
        state.options = options;
        if (state.page === '转盘') updateWheel();
      }
      if (state.page === '选项') await updateOptions(() => version === lifecycle.generation);
    } else if (state.page === '投票') { await updatePoll(() => version === lifecycle.generation); }
    const status = document.querySelector('#connection'); if (status) status.textContent = '';
  } catch (error) {
    if (version === lifecycle.generation) { const status = document.querySelector('#connection'); if (status) status.textContent = error.message; }
  } finally { syncing = false; }
}
