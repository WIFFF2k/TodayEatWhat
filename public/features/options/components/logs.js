// 管理共享选项、重命名、删除与永久操作记录
import { api } from '../../../shared/api.js';
import { escape, time } from '../../../shared/display.js';
export function fillLogs(view, data) {
  // 历史名称按文字转义，记录独立于现存选项
  view.querySelector('#additionLog').innerHTML = data.items.map(item => '<div class="record"><div><strong>' + (item.action === 'rename' ? escape(item.oldName) + ' → ' + escape(item.newName) : escape(item.action === 'delete' ? item.oldName : item.newName)) + '</strong><small>' + escape(item.actor) + ' ' + ({add:'添加',rename:'重命名',delete:'删除'})[item.action] + ' · ' + escape(item.category) + '</small></div><small>' + time(item.createdAt) + '</small></div>').join('') || '<p class="muted">暂无操作记录</p>';
  view.querySelector('#logPage').textContent = '第 ' + (view.logPage + 1) + ' 页';
  view.querySelector('#logPrev').disabled = view.logPage === 0; view.querySelector('#logNext').disabled = !data.hasMore;
  if (data.hasMore) view.logCursors[view.logPage + 1] = data.items.at(-1).id;
}
export async function refreshLogs(view, reset = false) {
  // 写入后展示最新页，其余页面保留固定游标
  const cursor = reset ? null : view.logCursors[view.logPage];
  const data = await api('/option-logs' + (cursor ? '?before=' + cursor : ''));
  if (reset) { view.logPage = 0; view.logCursors = [null]; }
  fillLogs(view, data);
}
