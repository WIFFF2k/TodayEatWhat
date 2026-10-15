// 奶龙转盘皮肤：以奶蛙为灵感的奶黄盘面、气泡和奶蛙脸装饰
import { paintWheel, spawnParticles } from './shared.js';
const palette = ['#ffd76b', '#ffb65c', '#a5d877', '#fff0a8', '#ff94a9', '#7dd9c7'];
export const milkFrogSkin = {
  id: 'milk-frog',
  label: '奶龙转盘',
  duration: 4000,
  statuses: { ready: '奶蛙已就位，准备开饭', start: '奶蛙正在挑选今天的味道…', spinning: '奶蛙转呀转，马上揭晓', done: '奶蛙锁定啦 · 今天就吃它', error: '奶蛙没接住，请重试' },
  content: {
    intro: '<div class="skin-intro milk-intro"><span class="eyebrow">奶蛙食堂 · 开饭倒计时</span><h2>今天吃啥，交给奶蛙</h2><p>咕呱一声，转出今天的好味道</p></div>',
    before: '<span class="milk-bubble bubble-one" aria-hidden="true"></span><span class="milk-bubble bubble-two" aria-hidden="true"></span><span class="milk-bubble bubble-three" aria-hidden="true"></span>',
    after: '<span class="milk-face wheel-core" aria-hidden="true">奶蛙</span>',
    caption: '<span class="skin-caption milk-caption">奶蛙说：选到的都好吃</span>'
  },
  draw(canvas, entries) {
    // 使用奶黄暖色色板绘制盘面
    paintWheel(canvas.getContext('2d'), entries, {
      palette,
      emptyFill: '#fff4bd',
      emptyText: '#9a6b2d',
      textColor: '#7a4a12',
      strokeStyle: '#fff8d9',
      lineWidth: 2,
      hubFill: '#fff7c9'
    });
  },
  celebrate(view) {
    // 中奖后冒出少量暖色气泡
    spawnParticles(view, { count: 24, colors: palette, radius: 55, spread: 115, drop: 45, duration: 1000, jitter: 400 });
  }
};
