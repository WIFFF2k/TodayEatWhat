// 统一文字转义、标题与上海时间展示
import { state } from './state.js';
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
