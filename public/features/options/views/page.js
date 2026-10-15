// 管理共享选项、拖动归类、重命名、删除与永久操作记录
import { state } from '../../../shared/state.js';
import { api, post } from '../../../shared/api.js';
import { escape, categoryLabel } from '../../../shared/display.js';
import { toast, failure, busy } from '../../../shared/interaction.js';
import { edit } from '../components/editor.js';
import { fillLogs, refreshLogs } from '../components/logs.js';
const logSizes = [10, 30, 50];
export async function renderOptions(view) {
  // 输入区域与同步列表分离，保留未提交的草稿
  const logSize = preferredLogSize();
  const [items, logs] = await Promise.all([api('/options'), api('/option-logs?size=' + logSize)]);
  state.options = items; view.logCursors = [null]; view.logPage = 0; view.logSize = logSize;
  const categoryOptions = state.categories.map(category => '<option value="' + escape(category.key) + '">' + escape(category.label) + '</option>').join('');
  const sizeOptions = logSizes.map(size => '<option value="' + size + '">' + size + ' 条</option>').join('');
  view.innerHTML = '<div class="card"><h2>添加一个新选择</h2><form class="row" id="addForm"><label class="field">餐厅名称<input id="newName" maxlength="60" required placeholder="填写餐厅或餐品"></label><label class="field">用餐方式<select id="newCategory">' + categoryOptions + '</select></label><button class="btn" type="submit">添加选项</button></form><p class="muted">勾选、重命名、删除和拖动归类对所有人共享，删除后保留操作记录及已有转盘、投票历史</p></div><div id="optionGroups" class="grid option-groups"></div><div class="card"><div class="row option-log-head"><h2>选项操作记录</h2><label class="log-size-control">每页<select id="logSize">' + sizeOptions + '</select></label></div><div id="additionLog" class="list"></div><div class="row pager"><button class="btn secondary" id="logPrev">上一页</button><span id="logPage"></span><button class="btn secondary" id="logNext">下一页</button></div></div><dialog id="optionDialog" aria-labelledby="optionDialogTitle"><form id="optionEditForm"><h2 id="optionDialogTitle"></h2><p id="optionEditDescription"></p><label class="field" id="renameField">新名称<input id="renameName" maxlength="60" required></label><p id="optionEditError" role="alert"></p><div class="row"><button class="btn" type="submit" id="optionConfirm"></button><button class="btn secondary" type="button" id="optionCancel">取消</button></div></form></dialog>';
  view.querySelector('#logSize').value = String(logSize);
  fill(view); fillLogs(view, logs);
  view.querySelector('#addForm').onsubmit = async event => {
    // 新增失败保留输入，成功后读取操作记录
    event.preventDefault(); if (state.busy) return; const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true; busy(true);
    try {
      const result = await post('/options', { name: form.querySelector('#newName').value, category: form.querySelector('#newCategory').value });
      form.querySelector('#newName').value = ''; state.options = result.options; fill(view); toast('选项已添加，大家都能看到'); await refreshLogs(view, true);
    } catch (error) { failure(error); } finally { button.disabled = false; busy(false); }
  };
  view.querySelector('#logSize').onchange = async event => {
    // 每页条数是当前浏览器的显示偏好，切换后从第一页重新读取
    if (state.busy) return;
    const size = Number(event.target.value);
    if (!logSizes.includes(size)) return;
    const previous = { size: view.logSize, page: view.logPage, cursors: view.logCursors };
    localStorage.setItem('eat-option-log-size', String(size));
    view.logSize = size; view.logPage = 0; view.logCursors = [null];
    busy(true);
    try { await refreshLogs(view); }
    catch (error) {
      view.logSize = previous.size; view.logPage = previous.page; view.logCursors = previous.cursors;
      event.target.value = String(previous.size); localStorage.setItem('eat-option-log-size', String(previous.size)); failure(error);
    } finally { busy(false); }
  };
  for (const [selector, delta] of [['#logPrev',-1],['#logNext',1]]) {
    view.querySelector(selector).onclick = async () => {
      // 游标分页避免新记录插入时重复翻页
      if (state.busy) return; busy(true); const previous = view.logPage; view.logPage += delta;
      try { await refreshLogs(view); } catch (error) { view.logPage = previous; failure(error); } finally { busy(false); }
    };
  }
}
function preferredLogSize() {
  // 默认每页 10 条，只接受当前页面提供的三种规格
  const saved = Number(localStorage.getItem('eat-option-log-size'));
  return logSizes.includes(saved) ? saved : 10;
}
function fill(view) {
  // 操作按钮位于勾选标签外，避免点击按钮触发勾选
  view.querySelector('#optionGroups').innerHTML = state.categories.map(category => {
    // 每个分类只展示尚未删除的选项
    const items = state.options.filter(item => item.category === category.key);
    return '<div class="card option-group" data-category="' + escape(category.key) + '"><h2>' + escape(category.label) + '</h2>' + (items.length ? items.map(item => '<div class="option-row" draggable="true" data-row="' + item.id + '"><label class="option"><input type="checkbox" data-option="' + item.id + '" ' + (item.enabled ? 'checked' : '') + '><span>' + escape(item.name) + '</span><small>' + escape(item.addedBy) + '</small></label><div class="option-actions"><button class="btn secondary" data-rename="' + item.id + '">重命名</button><button class="btn danger" data-delete="' + item.id + '">删除</button></div></div>').join('') : '<p class="muted">暂无选项，可在上方添加</p>') + '</div>';
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
      edit(view, state.options.find(item => item.id === Number(button.dataset[action])), action, async () => {
        // 保存后刷新列表和日志，编辑器不依赖页面实现
        fill(view); await refreshLogs(view, true);
      });
    };
  });
  bindDrag(view);
}
function bindDrag(view) {
  // 拖动整张选项卡片到其他分类卡片，交给服务端原子更新并留痕
  view.querySelectorAll('[data-row]').forEach(row => {
    row.ondragstart = event => {
      if (state.busy) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.dataset.row);
      view.querySelectorAll('.option-group').forEach(group => group.classList.remove('drag-over')); row.classList.add('is-dragging');
    };
    row.ondragend = () => {
      row.classList.remove('is-dragging'); view.querySelectorAll('.option-group').forEach(group => group.classList.remove('drag-over'));
    };
  });
  view.querySelectorAll('.option-group').forEach(group => {
    group.ondragover = event => {
      if (state.busy) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; group.classList.add('drag-over');
    };
    group.ondragleave = event => {
      if (!group.contains(event.relatedTarget)) group.classList.remove('drag-over');
    };
    group.ondrop = event => {
      event.preventDefault(); group.classList.remove('drag-over');
      const id = Number(event.dataTransfer.getData('text/plain')); const item = state.options.find(option => option.id === id);
      if (item && item.category !== group.dataset.category) moveOption(view, item, group.dataset.category);
    };
  });
}
async function moveOption(view, item, category) {
  // 归类移动成功后刷新分类和日志，失败保留原分类
  if (state.busy) return;
  busy(true);
  try {
    const result = await post('/options/' + item.id, { category, expectedName: item.name }, 'PATCH');
    state.options = result.options; fill(view); toast('已移动到「' + categoryLabel(category) + '」'); await refreshLogs(view, true);
  } catch (error) { failure(error); } finally { busy(false); }
}
export async function updateOptions(isCurrent) {
  // 独立同步日志，即使名称改回原值也能看到中间操作
  const groups = document.querySelector('#optionGroups'); if (!groups) return;
  const view = groups.parentElement; const page = view.logPage; const cursor = view.logCursors[page];
  const logs = await api('/option-logs?size=' + view.logSize + (cursor ? '&before=' + cursor : ''));
  if (!isCurrent() || state.busy || !view.isConnected || page !== view.logPage) return;
  fill(view); fillLogs(view, logs);
}
