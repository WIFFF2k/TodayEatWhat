// 管理共享选项、重命名、删除与永久操作记录
import { state, api, post, escape, time, toast, failure, busy } from './shared.js';
export async function renderOptions(view) {
  // 输入区域与同步列表分离，保留未提交的草稿
  const [items, logs] = await Promise.all([api('/options'), api('/option-logs')]);
  state.options = items; view.logCursors = [null]; view.logPage = 0;
  view.innerHTML = '<div class="card"><h2>添加一个新选择</h2><form class="row" id="addForm"><label class="field">餐厅名称<input id="newName" maxlength="60" required placeholder="填写餐厅或餐品"></label><label class="field">用餐方式<select id="newCategory"><option>外卖</option><option>出去吃</option></select></label><button class="btn" type="submit">添加选项</button></form><p class="muted">勾选、重命名和删除对所有人共享，删除后保留操作记录及已有转盘、投票历史</p></div><div id="optionGroups" class="grid"></div><div class="card"><h2>选项操作记录</h2><div id="additionLog" class="list"></div><div class="row pager"><button class="btn secondary" id="logPrev">上一页</button><span id="logPage"></span><button class="btn secondary" id="logNext">下一页</button></div></div><dialog id="optionDialog" aria-labelledby="optionDialogTitle"><form id="optionEditForm"><h2 id="optionDialogTitle"></h2><p id="optionEditDescription"></p><label class="field" id="renameField">新名称<input id="renameName" maxlength="60" required></label><p id="optionEditError" role="alert"></p><div class="row"><button class="btn" type="submit" id="optionConfirm"></button><button class="btn secondary" type="button" id="optionCancel">取消</button></div></form></dialog>';
  fill(view); fillLogs(view, logs);
  view.querySelector('#addForm').onsubmit = async event => {
    // 新增失败保留输入，成功后读取操作记录
    event.preventDefault(); if (state.busy) return; const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true; busy(true);
    try {
      const result = await post('/options', { name: form.querySelector('#newName').value, category: form.querySelector('#newCategory').value });
      form.querySelector('#newName').value = ''; state.options = result.options; fill(view); toast('选项已添加，大家都能看到'); await refreshLogs(view, true);
    } catch (error) { failure(error); } finally { button.disabled = false; busy(false); }
  };
  for (const [selector, delta] of [['#logPrev',-1],['#logNext',1]]) {
    view.querySelector(selector).onclick = async () => {
      // 游标分页避免新记录插入时重复翻页
      if (state.busy) return; busy(true); const previous = view.logPage; view.logPage += delta;
      try { await refreshLogs(view); } catch (error) { view.logPage = previous; failure(error); } finally { busy(false); }
    };
  }
}
function fill(view) {
  // 操作按钮位于勾选标签外，避免点击按钮触发勾选
  view.querySelector('#optionGroups').innerHTML = ['出去吃','外卖'].map(category => {
    // 每个分类只展示尚未删除的选项
    const items = state.options.filter(item => item.category === category);
    return '<div class="card"><h2>' + category + '</h2>' + (items.length ? items.map(item => '<div class="option-row" data-row="' + item.id + '"><label class="option"><input type="checkbox" data-option="' + item.id + '" ' + (item.enabled ? 'checked' : '') + '><span>' + escape(item.name) + '</span><small>' + escape(item.addedBy) + '</small></label><div class="option-actions"><button class="btn secondary" data-rename="' + item.id + '">重命名</button><button class="btn danger" data-delete="' + item.id + '">删除</button></div></div>').join('') : '<p class="muted">暂无选项，可在上方添加</p>') + '</div>';
  }).join('');
  view.querySelectorAll('[data-option]').forEach(input => {
    // 绑定勾选操作并恢复失败状态
    input.onchange = async () => {
      // 全局操作锁避免重复提交
      if (state.busy) { input.checked = !input.checked; return; }
      const previous = !input.checked; input.disabled = true; busy(true);
      try { const result = await post('/options/' + input.dataset.option, { enabled: input.checked }, 'PATCH'); state.options = result.options; fill(view); }
      catch (error) { input.checked = previous; failure(error); } finally { input.disabled = false; busy(false); }
    };
  });
  view.querySelectorAll('[data-rename],[data-delete]').forEach(button => {
    // 打开独立编辑快照，后台列表更新不覆盖输入
    button.onclick = () => {
      // 保存点击时的名称用于服务端并发检查
      if (state.busy) return; const action = button.dataset.rename ? 'rename' : 'delete';
      edit(view, state.options.find(item => item.id === Number(button.dataset[action])), action);
    };
  });
}
function edit(view, item, action) {
  // 确认全局变更，错误直接显示在弹窗内
  const dialog = view.querySelector('#optionDialog'); const form = view.querySelector('#optionEditForm');
  const rename = action === 'rename'; const input = view.querySelector('#renameName');
  view.querySelector('#optionDialogTitle').textContent = rename ? '重命名选项' : '删除选项';
  view.querySelector('#optionEditDescription').textContent = rename ? '正在修改「' + item.name + '」，已有历史记录保留原名称' : '确认删除「' + item.name + '」？所有人的转盘都将移除此项，操作记录和已有投票仍保留';
  view.querySelector('#renameField').hidden = !rename; input.disabled = !rename; input.value = item.name;
  view.querySelector('#optionConfirm').textContent = rename ? '保存名称' : '确认删除';
  view.querySelector('#optionConfirm').className = rename ? 'btn' : 'btn danger';
  view.querySelector('#optionEditError').textContent = '';
  view.querySelector('#optionCancel').onclick = () => {
    // 取消不会产生任何写入或操作记录
    if (!state.busy) dialog.close();
  };
  dialog.oncancel = event => {
    // 提交期间禁止关闭弹窗
    if (state.busy) event.preventDefault();
  };
  form.onsubmit = async event => {
    // 成功关闭弹窗，失败保留输入并显示错误
    event.preventDefault(); if (state.busy) return; busy(true);
    form.querySelectorAll('button').forEach(button => { button.disabled = true; });
    view.querySelector('#optionEditError').textContent = '';
    try {
      const body = { expectedName: item.name }; if (rename) body.name = input.value;
      const result = await post('/options/' + item.id, body, rename ? 'PATCH' : 'DELETE');
      state.options = result.options; fill(view); dialog.close(); toast(rename ? '名称已保存，已保留操作记录' : '选项已删除，历史记录仍保留');
      await refreshLogs(view, true);
    } catch (error) {
      if (dialog.open) view.querySelector('#optionEditError').textContent = error.message; else failure(error);
    } finally { form.querySelectorAll('button').forEach(button => { button.disabled = false; }); busy(false); }
  };
  dialog.showModal(); if (rename) input.select(); else view.querySelector('#optionCancel').focus();
}
function fillLogs(view, data) {
  // 历史名称按文字转义，记录独立于现存选项
  view.querySelector('#additionLog').innerHTML = data.items.map(item => '<div class="record"><div><strong>' + (item.action === 'rename' ? escape(item.oldName) + ' → ' + escape(item.newName) : escape(item.action === 'delete' ? item.oldName : item.newName)) + '</strong><small>' + escape(item.actor) + ' ' + ({add:'添加',rename:'重命名',delete:'删除'})[item.action] + ' · ' + escape(item.category) + '</small></div><small>' + time(item.createdAt) + '</small></div>').join('') || '<p class="muted">暂无操作记录</p>';
  view.querySelector('#logPage').textContent = '第 ' + (view.logPage + 1) + ' 页';
  view.querySelector('#logPrev').disabled = view.logPage === 0; view.querySelector('#logNext').disabled = !data.hasMore;
  if (data.hasMore) view.logCursors[view.logPage + 1] = data.items.at(-1).id;
}
async function refreshLogs(view, reset = false) {
  // 写入后展示最新页，其余页面保留固定游标
  const cursor = reset ? null : view.logCursors[view.logPage];
  const data = await api('/option-logs' + (cursor ? '?before=' + cursor : ''));
  if (reset) { view.logPage = 0; view.logCursors = [null]; }
  fillLogs(view, data);
}
export async function updateOptions(isCurrent) {
  // 独立同步日志，即使名称改回原值也能看到中间操作
  const groups = document.querySelector('#optionGroups'); if (!groups) return;
  const view = groups.parentElement; const page = view.logPage; const cursor = view.logCursors[page];
  const logs = await api('/option-logs' + (cursor ? '?before=' + cursor : ''));
  if (!isCurrent() || state.busy || !view.isConnected || page !== view.logPage) return;
  fill(view); fillLogs(view, logs);
}
