// 集中维护浏览器请求、显示安全和页面会话状态
export const state = { user: localStorage.getItem('eat-user') || '', page: '转盘', category: '出去吃', options: [], busy: false, dirty: false, serverOffset: 0, title: '', lastSpin: null, pollId: null, offset: 0 };
export async function api(url, init = {}) {
  // 姓名只在请求边界编码，网络和接口错误显示为中文
  let response;
  try { response = await fetch('/api' + url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers, 'x-user-name': encodeURIComponent(state.user) } }); }
  catch { throw new Error('连接失败，请确认电脑上的网站服务仍在运行'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
export function post(url, body, method = 'POST') {
  // 统一发送 JSON 业务操作
  return api(url, { method, body: JSON.stringify(body) });
}
export function escape(value) {
  // 将用户填写的名称作为文字显示，禁止作为 HTML 执行
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function now() {
  // 使用服务端时间差计算投票截止状态
  return Date.now() + state.serverOffset;
}
export function title() {
  // 标题规则统一由服务端提供
  return state.title;
}
export function time(value) {
  // 按上海时间显示明确的记录日期
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(value);
}
export function ago(value) {
  // 显示通知发起距今多久
  const minutes = Math.max(0, Math.floor((now() - value) / 60000));
  return minutes < 1 ? '刚刚' : minutes < 60 ? minutes + ' 分钟前' : Math.floor(minutes / 60) + ' 小时前';
}
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
