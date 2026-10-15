// 统一业务请求、中文身份编码和接口错误
import { state } from './state.js';
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
