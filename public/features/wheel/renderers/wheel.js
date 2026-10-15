// 转盘皮肤装配与绘制入口，按当前皮肤分发到独立皮肤模块
import { getSkin, hasSkin, skinList } from './skins/index.js';
import { reducedMotion, clearParticles } from './skins/shared.js';
export { reducedMotion };
export { skinList };
export function selectedSkin() {
  // 皮肤是当前浏览器的外观偏好，默认保持基础版
  const value = localStorage.getItem('eat-wheel-skin');
  return hasSkin(value) ? value : 'basic';
}
export function getSkinConfig(id) {
  // 返回皮肤配置，未知标识回退到基础皮肤
  return getSkin(id);
}
export function drawWheel(canvas, entries, skinId) {
  // 将盘面绘制交给当前皮肤模块，业务只关心皮肤标识
  getSkin(skinId).draw(canvas, entries);
}
export function celebrate(view) {
  // 中奖特效由当前皮肤模块决定
  getSkin(view.dataset.skin).celebrate(view);
}
export function clearCelebration(view) {
  // 释放当前盘面的粒子节点与动画
  clearParticles(view);
}
