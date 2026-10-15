// 管理页面导航事件、操作锁和用户提示
import { state } from './state.js';
export function toast(message) {
  // 在固定提示区域报告操作结果
  const node = document.querySelector('#toast'); node.textContent = message; node.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.hidden = true; }, 5000);
}
export function navigate(page, pollId = null, offset = 0) {
  // 通过单一页面入口切换功能并清除旧表单状态
  document.dispatchEvent(new CustomEvent('navigate', { detail: { page, pollId, offset } }));
}
export function busy(value) {
  // 操作期间锁定切换入口，防止动画或请求回写到其他页面
  state.busy = value;
  document.querySelectorAll('nav button,#switch').forEach(button => { button.disabled = value; });
}
export function failure(error) {
  // 操作失败保留页面并显示真实原因
  toast(error.message);
}
