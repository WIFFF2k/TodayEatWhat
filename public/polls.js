// 展示投票详情、票数、改票和历史列表
import { state, api, post, escape, now, time, toast, failure, busy, navigate } from './shared.js';
export async function renderPolls(view) {
  // 有指定投票时直达详情，否则显示分页列表
  if (state.pollId) { const poll = await api('/polls/' + state.pollId); return detail(view, poll); }
  const rows = await api('/polls?offset=' + state.offset);
  view.innerHTML = '<div class="card"><h2>大家的吃饭投票</h2><p class="muted">从转盘结果发起投票，截止前可修改自己的选择</p><div id="pollList">' + (rows.length ? rows.map(p => '<div class="record"><div><strong>' + escape(p.title) + '</strong><small>' + escape(p.creator) + ' · ' + time(p.createdAt) + ' · ' + (p.closed ? '已截止' : '进行中') + ' · ' + p.participants + ' 人参与</small>' + (p.proposedName ? '<small>转盘结果：' + escape(p.proposedName) + '</small>' : '') + '</div><button class="btn secondary" data-poll="' + p.id + '">' + (p.closed ? '查看结果' : '参与投票') + '</button></div>').join('') : '<p class="muted">还没有投票，先去转盘试试吧</p>') + '</div><div class="row pager"><button class="btn secondary" id="prev" ' + (!state.offset ? 'disabled' : '') + '>上一页</button><span>第 ' + (state.offset / 30 + 1) + ' 页</span><button class="btn secondary" id="next" ' + (rows.length < 30 ? 'disabled' : '') + '>下一页</button></div></div>';
  view.querySelectorAll('[data-poll]').forEach(button => { button.onclick = () => navigate('投票', Number(button.dataset.poll)); });
  view.querySelector('#prev').onclick = () => page(-30);
  view.querySelector('#next').onclick = () => page(30);
}
function page(delta) {
  // 列表翻页通过页面事件更新，保留请求代次保护
  const offset = state.offset + delta;
  navigate('投票', null, offset);
}
function detail(view, poll) {
  // 用数据库返回的本人选择恢复勾选，截止后只展示结果
  state.dirty = false;
  view.innerHTML = '<div class="card" id="pollDetail" data-id="' + poll.id + '"><button class="btn secondary" id="backPoll">返回投票列表</button><h2>' + escape(poll.title) + '</h2><p>' + escape(poll.creator) + ' 发起' + (poll.proposedName ? ' · 转盘结果：<strong>' + escape(poll.proposedName) + '</strong>' : '') + '</p><p class="muted">' + (poll.mode === 'single' ? '单选' : '多选') + ' · 截止 ' + time(poll.deadline) + '</p><p id="pollStatus"></p><form id="voteForm"><div class="list">' + poll.choices.map(choice => '<label class="vote-choice"><input type="' + (poll.mode === 'single' ? 'radio' : 'checkbox') + '" name="choice" value="' + choice.id + '" ' + (poll.votedChoiceIds.includes(choice.id) ? 'checked' : '') + '><span>' + escape(choice.name) + '</span><strong data-count="' + choice.id + '">' + choice.votes + ' 票</strong></label>').join('') + '</div><button class="btn" id="voteSubmit" type="submit">' + (poll.votedChoiceIds.length ? '修改投票' : '提交投票') + '</button></form><div id="pollOutcome"></div></div>';
  view.querySelector('#backPoll').onclick = () => navigate('投票');
  view.querySelector('#voteForm').onchange = () => { state.dirty = true; };
  applyStatus(view, poll);
  view.querySelector('#voteForm').onsubmit = async event => {
    // 保留待提交勾选直到服务器确认改票成功
    event.preventDefault(); if (state.busy) return; busy(true); view.querySelector('#voteSubmit').disabled = true;
    try { const choiceIds = [...view.querySelectorAll('input:checked')].map(input => Number(input.value)); const result = await post('/polls/' + poll.id + '/vote', { choiceIds }); detail(view, result); toast('投票已保存'); }
    catch (error) { failure(error); view.querySelector('#voteSubmit').disabled = poll.deadline <= now(); }
    finally { busy(false); }
  };
}
function applyStatus(view, poll) {
  // 用服务器状态和时间差显示截止状态以及并列结果
  const closed = poll.closed || poll.deadline <= now();
  view.querySelector('#pollStatus').textContent = (closed ? '已截止' : '进行中 · 剩余 ' + Math.max(1, Math.ceil((poll.deadline - now()) / 60000)) + ' 分钟') + ' · ' + poll.participants + ' 人参与';
  view.querySelectorAll('input').forEach(input => { input.disabled = closed; });
  view.querySelector('#voteSubmit').disabled = closed;
  const max = Math.max(...poll.choices.map(choice => choice.votes));
  const winners = poll.choices.filter(choice => choice.votes === max).map(choice => choice.name);
  view.querySelector('#pollOutcome').textContent = closed ? (max ? '最高票：' + winners.join('、') + '（' + max + ' 票）' : '本次投票无人参与') : '';
}
export async function updatePoll(isCurrent) {
  // 更新票数与截止状态，保留尚未提交的选择
  const view = document.querySelector('#pollDetail'); if (!view || state.busy) return;
  const poll = await api('/polls/' + view.dataset.id); if (!isCurrent() || state.busy || !view.isConnected) return;
  poll.choices.forEach(choice => { view.querySelector('[data-count="' + choice.id + '"]').textContent = choice.votes + ' 票'; });
  if (!state.dirty) view.querySelectorAll('input').forEach(input => { input.checked = poll.votedChoiceIds.includes(Number(input.value)); });
  applyStatus(view, poll);
}
