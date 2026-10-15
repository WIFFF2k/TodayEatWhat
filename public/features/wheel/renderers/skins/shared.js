// 转盘皮肤共享的盘面绘制与粒子动画能力，供各皮肤模块复用
export function reducedMotion() {
  // 遵循设备的减少动态效果设置
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function paintWheel(ctx, entries, config) {
  // 按统一几何规则绘制扇区、文字与中心圆，皮肤只提供外观配置
  ctx.clearRect(0, 0, 720, 720);
  const count = entries.length;
  if (!count) {
    drawEmptyWheel(ctx, config.emptyFill, config.emptyText);
    return;
  }
  const angle = Math.PI * 2 / count;
  for (let index = 0; index < count; index++) {
    const start = -Math.PI / 2 + index * angle;
    const color = config.palette[index % config.palette.length];
    ctx.beginPath();
    ctx.moveTo(360, 360);
    ctx.arc(360, 360, 350, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = typeof config.fillStyle === 'function' ? config.fillStyle(ctx, color, index) : color;
    ctx.fill();
    ctx.strokeStyle = typeof config.strokeStyle === 'function' ? config.strokeStyle(color) : (config.strokeStyle || '#ffffff');
    ctx.lineWidth = config.lineWidth || 1;
    ctx.stroke();
    if (config.rim) config.rim(ctx, color, index, start, angle);
    ctx.save();
    ctx.translate(360, 360);
    ctx.rotate(start + angle / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = config.textColor;
    ctx.font = 'bold ' + (count > 12 ? 16 : 23) + 'px sans-serif';
    if (config.textShadow) {
      ctx.shadowColor = config.textShadow(color);
      ctx.shadowBlur = 9;
    }
    const label = entries[index].name;
    const chunks = label.match(/.{1,8}/gu);
    chunks.forEach((chunk, line) => {
      // 长名称沿原有扇区中心分行排布
      ctx.fillText(chunk, 224, (line - (chunks.length - 1) / 2) * 26, 210);
    });
    ctx.restore();
  }
  if (config.ticks) drawTicks(ctx);
  ctx.beginPath();
  ctx.arc(360, 360, 44, 0, Math.PI * 2);
  ctx.fillStyle = config.hubFill;
  ctx.fill();
}
function drawEmptyWheel(ctx, fill, textColor) {
  // 空候选时绘制统一底圆和提示文字
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(360, 360, 350, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('请先启用选项', 360, 370);
}
function drawTicks(ctx) {
  // 绘制盘面外圈刻度装饰
  for (let tick = 0; tick < 90; tick++) {
    const angle = tick * Math.PI * 2 / 90;
    const radius = tick % 5 === 0 ? 325 : 332;
    ctx.beginPath();
    ctx.moveTo(360 + Math.cos(angle) * radius, 360 + Math.sin(angle) * radius);
    ctx.lineTo(360 + Math.cos(angle) * 336, 360 + Math.sin(angle) * 336);
    ctx.strokeStyle = '#ffffff80';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
export function clearParticles(view) {
  // 皮肤切换或再次抽签时释放上一轮粒子动画和节点
  view.querySelectorAll('.prize-particle').forEach(node => {
    node.getAnimations().forEach(animation => animation.cancel());
    node.remove();
  });
}
export function spawnParticles(view, config) {
  // 生成有限数量并自动回收的皮肤粒子，避免动画节点累积
  clearParticles(view);
  if (reducedMotion()) return;
  const layer = view.querySelector('.wheel-particles');
  if (!layer) return;
  for (let index = 0; index < config.count; index++) {
    const node = document.createElement('i');
    node.className = 'prize-particle';
    node.style.background = config.colors[index % config.colors.length];
    layer.append(node);
    const angle = index * Math.PI * 2 / config.count;
    const radius = config.radius + Math.random() * config.spread;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const animation = node.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(.2)', opacity: 0 },
      { transform: 'translate(' + x * .55 + 'px,' + y * .55 + 'px) rotate(120deg) scale(1)', opacity: 1, offset: .2 },
      { transform: 'translate(' + x + 'px,' + (y + config.drop) + 'px) rotate(340deg) scale(.3)', opacity: 0 }
    ], {
      duration: config.duration + Math.random() * config.jitter,
      easing: 'cubic-bezier(.16,.7,.35,1)',
      fill: 'forwards'
    });
    animation.onfinish = () => {
      // 动画结束立即释放节点，不保留累积的特效对象
      node.remove();
    };
  }
}
