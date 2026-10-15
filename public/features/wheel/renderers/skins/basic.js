// 基础皮肤配置：默认高对比盘面，不额外增加装饰和粒子
import { paintWheel } from './shared.js';
const palette = ['#4d96ff', '#ffb457', '#5fc5a0', '#ef7c97', '#8d7fea', '#f28e64'];
export const basicSkin = {
  id: 'basic',
  label: '基础皮肤',
  duration: 3200,
  statuses: { ready: '', start: '正在准备抽签…', spinning: '转盘转动中…', done: '今天吃这个', error: '没有抽成，请重试' },
  content: { intro: '', before: '', after: '', caption: '' },
  draw(canvas, entries) {
    // 使用基础色板绘制清晰可读的盘面
    paintWheel(canvas.getContext('2d'), entries, {
      palette,
      emptyFill: '#dce5f0',
      emptyText: '#334155',
      textColor: '#152238',
      strokeStyle: '#ffffff',
      lineWidth: 1,
      hubFill: '#fff'
    });
  },
  celebrate() {
    // 基础皮肤不触发中奖粒子
  }
};
