// 展示抽签历史与关联投票
import { state } from '../../../shared/state.js';
import { api } from '../../../shared/api.js';
import { escape, time } from '../../../shared/display.js';
import { navigate } from '../../../shared/interaction.js';
export async function renderRecords(view) {
  // 展示完整分页抽签记录与关联投票
  const rows = await api('/records?offset=' + state.offset);
  view.innerHTML = '<div class="card"><h2>转盘历史</h2><div class="list">' + (rows.length ? rows.map(row => '<div class="record"><div><strong>' + escape(row.optionName) + '</strong><small>' + escape(row.category) + ' · ' + escape(row.userName) + ' · ' + time(row.createdAt) + '</small></div>' + (row.pollId ? '<button class="btn secondary" data-poll="' + row.pollId + '">查看投票</button>' : '') + '</div>').join('') : '<p class="muted">还没有转盘记录</p>') + '</div><div class="row pager"><button class="btn secondary" id="prev" ' + (state.offset === 0 ? 'disabled' : '') + '>上一页</button><span>第 ' + (state.offset / 30 + 1) + ' 页</span><button class="btn secondary" id="next" ' + (rows.length < 30 ? 'disabled' : '') + '>下一页</button></div></div>';
  view.querySelectorAll('[data-poll]').forEach(button => { button.onclick = () => navigate('投票', Number(button.dataset.poll)); });
  view.querySelector('#prev').onclick = () => { navigate('记录', null, state.offset - 30); };
  view.querySelector('#next').onclick = () => { navigate('记录', null, state.offset + 30); };
}
