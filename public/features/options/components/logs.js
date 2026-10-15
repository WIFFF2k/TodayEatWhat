// 管理选项操作记录的展示与游标分页
import { api } from '../../../shared/api.js';
import { escape, categoryLabel, time } from '../../../shared/display.js';
export function fillLogs(view, data) {
  // 历史名称按文字转义，记录独立于现存选项
  const actionText = { add: '添加', rename: '重命名', delete: '删除', move: '移动' };
  view.querySelector('#additionLog').innerHTML = data.items.map(item => {
    const title = item.action === 'rename' ? escape(item.oldName) + ' → ' + escape(item.newName) : escape(item.action === 'move' ? item.newName : item.action === 'delete' ? item.oldName : item.newName);
    const meta = item.action === 'move' ? escape(item.actor) + ' 移动 · ' + escape(categoryLabel(item.oldCategory)) + ' → ' + escape(categoryLabel(item.newCategory)) : escape(item.actor) + ' ' + actionText[item.action] + ' · ' + escape(categoryLabel(item.category));
    return '<div class="record"><div><strong>' + title + '</strong><small>' + meta + '</small></div><small>' + time(item.createdAt) + '</small></div>';
  }).join('') || '<p class="muted">暂无操作记录</p>';
  view.querySelector('#logPage').textContent = '第 ' + (view.logPage + 1) + ' 页';
  view.querySelector('#logPrev').disabled = view.logPage === 0; view.querySelector('#logNext').disabled = !data.hasMore;
  if (data.hasMore) view.logCursors[view.logPage + 1] = data.items.at(-1).id;
}
export async function refreshLogs(view, reset = false) {
  // 写入后展示最新页，其余页面保留固定游标
  const cursor = reset ? null : view.logCursors[view.logPage];
  const query = new URLSearchParams({ size: String(view.logSize) });
  if (cursor) query.set('before', String(cursor));
  const data = await api('/option-logs?' + query.toString());
  if (reset) { view.logPage = 0; view.logCursors = [null]; }
  fillLogs(view, data);
}
