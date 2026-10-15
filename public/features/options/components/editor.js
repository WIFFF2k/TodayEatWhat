// 管理共享选项、重命名、删除与永久操作记录
import { state } from '../../../shared/state.js';
import { post } from '../../../shared/api.js';
import { toast, failure, busy } from '../../../shared/interaction.js';
export function edit(view, item, action, onSaved) {
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
      state.options = result.options; dialog.close(); toast(rename ? '名称已保存，已保留操作记录' : '选项已删除，历史记录仍保留');
      await onSaved();
    } catch (error) {
      if (dialog.open) view.querySelector('#optionEditError').textContent = error.message; else failure(error);
    } finally { form.querySelectorAll('button').forEach(button => { button.disabled = false; }); busy(false); }
  };
  dialog.showModal(); if (rename) input.select(); else view.querySelector('#optionCancel').focus();
}
