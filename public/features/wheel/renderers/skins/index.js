// 统一装配全部转盘皮肤，供页面按皮肤标识查询绘制与特效配置
import { basicSkin } from './basic.js';
import { neonSkin } from './neon.js';
import { milkFrogSkin } from './milk-frog.js';
const skins = [basicSkin, neonSkin, milkFrogSkin];
const skinById = Object.fromEntries(skins.map(skin => [skin.id, skin]));
export function skinList() {
  // 返回完整皮肤配置并保持稳定选项顺序
  return skins.slice();
}
export function getSkin(id) {
  // 未知皮肤回退到基础皮肤，避免历史偏好导致页面失效
  return skinById[id] || basicSkin;
}
export function hasSkin(id) {
  // 判断浏览器保存的皮肤是否仍在当前皮肤清单中
  return Boolean(skinById[id]);
}
