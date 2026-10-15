// 展示投票详情、票数、改票和历史列表
import { state } from '../../../shared/state.js';
import { api, post } from '../../../shared/api.js';
import { escape, now, time } from '../../../shared/display.js';
import { toast, failure, busy, navigate } from '../../../shared/interaction.js';
export function detail(view, poll) {
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
