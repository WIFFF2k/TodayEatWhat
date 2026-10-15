// 展示投票详情、票数、改票和历史列表
import { state } from '../../../shared/state.js';
import { api } from '../../../shared/api.js';
import { escape, time } from '../../../shared/display.js';
import { navigate } from '../../../shared/interaction.js';
import { detail } from '../components/detail.js';
export async function renderPolls(view) {
  // 有指定投票时直达详情，否则显示分页列表
  if (state.pollId) { const poll = await api('/polls/' + state.pollId); return detail(view, poll); }
  const rows = await api('/polls?offset=' + state.offset);
  view.innerHTML = '<div class="card"><h2>大家的吃饭投票</h2><p class="muted">从转盘结果发起投票，截止前可修改自己的选择</p><div class="list" id="pollList">' + (rows.length ? rows.map(p => '<div class="record"><div><strong>' + escape(p.title) + '</strong><small>' + escape(p.creator) + ' · ' + time(p.createdAt) + ' · ' + (p.closed ? '已截止' : '进行中') + ' · ' + p.participants + ' 人参与</small>' + (p.proposedName ? '<small>转盘结果：' + escape(p.proposedName) + '</small>' : '') + '</div><button class="btn secondary" data-poll="' + p.id + '">' + (p.closed ? '查看结果' : '参与投票') + '</button></div>').join('') : '<p class="muted">还没有投票，先去转盘试试吧</p>') + '</div><div class="row pager"><button class="btn secondary" id="prev" ' + (!state.offset ? 'disabled' : '') + '>上一页</button><span>第 ' + (state.offset / 30 + 1) + ' 页</span><button class="btn secondary" id="next" ' + (rows.length < 30 ? 'disabled' : '') + '>下一页</button></div></div>';
  view.querySelectorAll('[data-poll]').forEach(button => { button.onclick = () => navigate('投票', Number(button.dataset.poll)); });
  view.querySelector('#prev').onclick = () => page(-30);
  view.querySelector('#next').onclick = () => page(30);
}
function page(delta) {
  // 列表翻页通过页面事件更新，保留请求代次保护
  const offset = state.offset + delta;
  navigate('投票', null, offset);
}
