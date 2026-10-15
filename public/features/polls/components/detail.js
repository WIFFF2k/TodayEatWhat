// 展示投票选项、人员分布和直达其他投票的入口
import { state } from '../../../shared/state.js';
import { api, post } from '../../../shared/api.js';
import { escape, now, time } from '../../../shared/display.js';
import { toast, failure, busy, navigate } from '../../../shared/interaction.js';
export function detail(view, poll) {
  // 用数据库返回的本人选择恢复勾选，截止后只展示结果
  state.dirty = false;
  view.innerHTML = '<div class="card" id="pollDetail" data-id="' + poll.id + '"><button class="btn secondary" id="backPoll">返回投票列表</button><h2>' + escape(poll.title) + '</h2><p>' + escape(poll.creator) + ' 发起' + (poll.proposedName ? ' · 转盘结果：<strong>' + escape(poll.proposedName) + '</strong>' : '') + '</p><p class="muted">' + (poll.mode === 'single' ? '单选' : '多选') + ' · 截止 ' + time(poll.deadline) + '</p><p id="pollStatus"></p><form id="voteForm"><div class="list">' + poll.choices.map(choice => '<label class="vote-choice"><input type="' + (poll.mode === 'single' ? 'radio' : 'checkbox') + '" name="choice" value="' + choice.id + '" ' + (poll.votedChoiceIds.includes(choice.id) ? 'checked' : '') + '><span>' + escape(choice.name) + '</span><strong data-count="' + choice.id + '">' + choice.votes + ' 票</strong></label>').join('') + '</div><button class="btn" id="voteSubmit" type="submit">' + (poll.votedChoiceIds.length ? '修改投票' : '提交投票') + '</button></form><div id="pollOutcome"></div><h3 class="poll-breakdown-title">谁选了什么</h3><div class="poll-tabs" id="pollTabs" role="tablist"></div><div class="poll-panel" id="pollPanel"></div></div>';
  view.dataset.breakdown = breakdownKey(poll);
  view.querySelector('#backPoll').onclick = () => navigate('投票');
  view.querySelector('#voteForm').onchange = () => { state.dirty = true; };
  applyStatus(view, poll); renderBreakdown(view, poll);
  view.querySelector('#voteForm').onsubmit = async event => {
    // 保留待提交勾选直到服务器确认改票成功
    event.preventDefault(); if (state.busy) return; busy(true); view.querySelector('#voteSubmit').disabled = true;
    try { const choiceIds = [...view.querySelectorAll('#voteForm input:checked')].map(input => Number(input.value)); const result = await post('/polls/' + poll.id + '/vote', { choiceIds }); detail(view, result); toast('投票已保存'); }
    catch (error) { failure(error); view.querySelector('#voteSubmit').disabled = poll.deadline <= now(); }
    finally { busy(false); }
  };
}
function breakdownKey(poll) {
  // 只比较人员分布相关数据，用于判断是否需要重建选项卡
  return JSON.stringify([poll.choices, poll.pendingNames, poll.redoOpenPolls]);
}
function renderBreakdown(view, poll) {
  // 每个选项和未选择的人各占一个选项卡，不服重转的人带出本人其他进行中投票
  const openPolls = new Map();
  for (const item of poll.redoOpenPolls) if (!openPolls.has(item.creator)) openPolls.set(item.creator, [item]); else openPolls.get(item.creator).push(item);
  const groups = poll.choices.map(choice => ({ key: 'choice-' + choice.id, label: choice.name, count: choice.votes, empty: '还没有人选这一项', people: choice.voters.map(name => ({ name, polls: choice.code === 'redo' ? openPolls.get(name) || [] : [] })) }));
  groups.push({ key: 'pending', label: '未选择', count: poll.pendingNames.length, empty: '所有人都已选择', people: poll.pendingNames.map(name => ({ name, polls: [] })) });
  const own = poll.votedChoiceIds.length ? 'choice-' + poll.votedChoiceIds[0] : '';
  const current = view.dataset.tab || own;
  const selected = groups.some(group => group.key === current) ? current : groups[0].key;
  view.dataset.tab = selected;
  view.querySelector('#pollTabs').innerHTML = groups.map(group => '<button type="button" class="poll-tab' + (group.key === selected ? ' active' : '') + '" data-tab="' + group.key + '" role="tab" aria-selected="' + (group.key === selected) + '">' + escape(group.label) + '<span class="muted">' + group.count + '</span></button>').join('');
  view.querySelector('#pollPanel').innerHTML = groups.map(group => '<div class="poll-people" data-panel="' + group.key + '"' + (group.key === selected ? '' : ' hidden') + '>' + peopleHtml(group) + '</div>').join('');
  view.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => showTab(view, button.dataset.tab); });
  view.querySelectorAll('[data-open-poll]').forEach(button => { button.onclick = () => { if (state.busy) return; navigate('投票', Number(button.dataset.openPoll)); }; });
}
function peopleHtml(group) {
  // 没有人的选项卡给出明确说明，有本人其他投票时在名字后面提供入口
  if (!group.people.length) return '<p class="muted">' + group.empty + '</p>';
  return group.people.map(person => '<span class="poll-person">' + escape(person.name) + person.polls.map(item => '<button type="button" class="btn secondary" data-open-poll="' + item.id + '">' + (item.proposedName ? '参加「' + escape(item.proposedName) + '」的投票' : '参加这个投票') + '</button>').join('') + '</span>').join('');
}
function showTab(view, key) {
  // 只切换当前查看的选项卡，不改动表单勾选和票数
  view.dataset.tab = key;
  view.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === key; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  view.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== key; });
}
function applyStatus(view, poll) {
  // 用服务器状态和时间差显示截止状态以及并列结果
  const closed = poll.closed || poll.deadline <= now();
  view.querySelector('#pollStatus').textContent = (closed ? '已截止' : '进行中 · 剩余 ' + Math.max(1, Math.ceil((poll.deadline - now()) / 60000)) + ' 分钟') + ' · ' + poll.participants + ' 人参与';
  view.querySelectorAll('#voteForm input').forEach(input => { input.disabled = closed; });
  view.querySelector('#voteSubmit').disabled = closed;
  const max = Math.max(...poll.choices.map(choice => choice.votes));
  const winners = poll.choices.filter(choice => choice.votes === max).map(choice => choice.name);
  view.querySelector('#pollOutcome').textContent = closed ? (max ? '最高票：' + winners.join('、') + '（' + max + ' 票）' : '本次投票无人参与') : '';
}
export async function updatePoll(isCurrent) {
  // 更新票数、人员分布与截止状态，保留尚未提交的选择
  const view = document.querySelector('#pollDetail'); if (!view || state.busy) return;
  const poll = await api('/polls/' + view.dataset.id); if (!isCurrent() || state.busy || !view.isConnected) return;
  poll.choices.forEach(choice => { view.querySelector('[data-count="' + choice.id + '"]').textContent = choice.votes + ' 票'; });
  const breakdown = breakdownKey(poll);
  if (breakdown !== view.dataset.breakdown) { view.dataset.breakdown = breakdown; renderBreakdown(view, poll); }
  if (!state.dirty) view.querySelectorAll('#voteForm input').forEach(input => { input.checked = poll.votedChoiceIds.includes(Number(input.value)); });
  applyStatus(view, poll);
}
