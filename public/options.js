// 管理共享勾选、添加选项与添加记录
import { state, api, post, escape, time, toast, failure, busy } from './shared.js';
export async function renderOptions(view) {
  // 输入表单与同步列表分离，后台更新不清空输入
  state.options = await api('/options');
  view.innerHTML = '<div class="card"><h2>添加一个新选择</h2><form class="row" id="addForm"><label class="field">餐厅名称<input id="newName" maxlength="60" required placeholder="填写餐厅或餐品"></label><label class="field">用餐方式<select id="newCategory"><option>外卖</option><option>出去吃</option></select></label><button class="btn" type="submit">添加选项</button></form><p class="muted">勾选状态对所有人共享，取消勾选后不会再转到该选项</p></div><div id="optionGroups" class="grid"></div><div class="card"><h2>添加记录</h2><div id="additionLog" class="list"></div></div>';
  fill(view);
  view.querySelector('#addForm').onsubmit = async event => {
    // 新增成功后从数据库重新读取，失败时保留输入
    event.preventDefault(); if (state.busy) return; const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true; busy(true);
    try {
      const result = await post('/options', { name: form.querySelector('#newName').value, category: form.querySelector('#newCategory').value });
      form.querySelector('#newName').value = ''; state.options = result.options; fill(view); toast('选项已添加，大家都能看到');
    } catch (error) { failure(error); } finally { button.disabled = false; busy(false); }
  };
}
function fill(view) {
  // 从持久化状态更新列表和按时间倒序的添加记录
  view.querySelector('#optionGroups').innerHTML = ['外卖','出去吃'].map(category => '<div class="card"><h2>' + category + '</h2>' + state.options.filter(item => item.category === category).map(item => '<label class="option"><input type="checkbox" data-option="' + item.id + '" ' + (item.enabled ? 'checked' : '') + '><span>' + escape(item.name) + '</span><small>' + escape(item.addedBy) + '</small></label>').join('') + '</div>').join('');
  view.querySelector('#additionLog').innerHTML = [...state.options].reverse().map(item => '<div class="record"><div><strong>' + escape(item.name) + '</strong><small>' + escape(item.addedBy) + ' 添加 · ' + escape(item.category) + '</small></div><small>' + time(item.createdAt) + '</small></div>').join('');
  view.querySelectorAll('[data-option]').forEach(input => { input.onchange = async () => {
    // 请求失败恢复旧勾选，防止界面与数据库不一致
    if (state.busy) { input.checked = !input.checked; return; }
    const previous = !input.checked; input.disabled = true; busy(true);
    try { const result = await post('/options/' + input.dataset.option, { enabled: input.checked }, 'PATCH'); state.options = result.options; fill(view); }
    catch (error) { input.checked = previous; failure(error); } finally { input.disabled = false; busy(false); }
  }; });
}
export function updateOptions() {
  // 同步时只更新已存在的选项列表
  const groups = document.querySelector('#optionGroups'); if (groups) fill(groups.parentElement);
}
