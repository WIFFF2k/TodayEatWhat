// 读取并保存所有人共享的投票默认规则
import { state } from '../../../shared/state.js';
import { api, post } from '../../../shared/api.js';
import { toast, failure, busy } from '../../../shared/interaction.js';
export async function renderSettings(view) {
  // 每次进入设置从服务端读取当前值
  const settings = await api('/settings');
  view.innerHTML = '<div class="card"><h2>投票设置</h2><p class="muted">对所有人共享，仅影响之后新发起的投票</p><form id="settingsForm" class="settings-form"><label class="field">投票方式<select id="mode"><option value="single">单选</option><option value="multiple">多选</option></select></label><label class="field">截止时间（分钟）<input id="minutes" type="number" min="1" max="1440" step="1" required></label><p class="muted">可设置 1 到 1440 分钟，默认单选、60 分钟</p><button type="submit" class="btn">保存设置</button></form></div>';
  view.querySelector('#mode').value = settings.pollMode; view.querySelector('#minutes').value = settings.pollMinutes;
  view.querySelector('#settingsForm').onsubmit = async event => {
    // 仅成功保存后显示确认，失败保留正在编辑的配置
    event.preventDefault(); if (state.busy) return; const button = view.querySelector('button'); button.disabled = true; busy(true);
    try { await post('/settings', { pollMode: view.querySelector('#mode').value, pollMinutes: Number(view.querySelector('#minutes').value) }, 'PUT'); toast('全局投票设置已保存'); }
    catch (error) { failure(error); } finally { button.disabled = false; busy(false); }
  };
}
