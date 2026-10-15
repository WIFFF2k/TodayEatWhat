// 霓虹宇宙皮肤：暗色盘面、轨道光环和中奖粒子
import { paintWheel, spawnParticles } from './shared.js';
const palette = ['#43f6e9', '#ad8aff', '#ff6cbe', '#ffbd69', '#67b6ff', '#8af3ab'];
export const neonSkin = {
  id: 'neon',
  label: '霓虹宇宙 ✦',
  duration: 4200,
  statuses: { ready: '能量就绪，等待启航', start: '正在连接美味星系…', spinning: '能量流转中 · 即将锁定美味', done: '坐标已锁定 · 美味降临', error: '启航未完成，请重试' },
  content: {
    intro: '<div class="skin-intro neon-intro"><span class="eyebrow">201 · 味觉探索计划</span><h2>让宇宙决定这一餐</h2><p>启动能量 · 捕获今天的美味坐标</p></div>',
    before: '<span class="wheel-ring ring-outer" aria-hidden="true"></span><span class="wheel-ring ring-inner" aria-hidden="true"></span>',
    after: '<span class="neon-core wheel-core" aria-hidden="true">201</span>',
    caption: '<span class="skin-caption neon-caption">每一份期待，都有相同的机会</span>'
  },
  draw(canvas, entries) {
    // 使用霓虹径向渐变和刻度绘制盘面
    paintWheel(canvas.getContext('2d'), entries, {
      palette,
      emptyFill: '#111c39',
      emptyText: '#c9e9f9',
      textColor: '#f5fcff',
      hubFill: '#0b142d',
      fillStyle(ctx, color) {
        const fill = ctx.createRadialGradient(360, 360, 35, 360, 360, 350);
        fill.addColorStop(0, '#11152f');
        fill.addColorStop(.72, color + '28');
        fill.addColorStop(1, color + '80');
        return fill;
      },
      strokeStyle(color) { return color + '99'; },
      lineWidth: 2,
      rim(ctx, color, index, start, angle) {
        ctx.beginPath();
        ctx.arc(360, 360, 341, start + .015, start + angle - .015);
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.stroke();
      },
      textShadow(color) { return color; },
      ticks: true
    });
  },
  celebrate(view) {
    // 中奖后从盘面周围喷出彩色粒子
    spawnParticles(view, { count: 38, colors: palette, radius: 75, spread: 135, drop: 95, duration: 1400, jitter: 500 });
  }
};
