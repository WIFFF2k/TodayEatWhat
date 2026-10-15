// 绘制两种转盘皮肤与短时中奖粒子，随机结果仍由业务模块提供
const basicColors = ['#4d96ff','#ffb457','#5fc5a0','#ef7c97','#8d7fea','#f28e64'];
const neonColors = ['#43f6e9','#ad8aff','#ff6cbe','#ffbd69','#67b6ff','#8af3ab'];
export function reducedMotion() {
  // 遵循设备的减少动态效果设置
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function selectedSkin() {
  // 皮肤是当前浏览器的外观偏好，默认保持基础版
  return localStorage.getItem('eat-wheel-skin') === 'neon' ? 'neon' : 'basic';
}
export function drawWheel(canvas, entries, skin) {
  // 两种皮肤共用扇区和文字坐标，确保指针落点完全一致
  const ctx = canvas.getContext('2d'); const count = entries.length; const neon = skin === 'neon';
  ctx.clearRect(0, 0, 720, 720);
  if (!count) {
    ctx.fillStyle = neon ? '#111c39' : '#dce5f0'; ctx.beginPath(); ctx.arc(360,360,350,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = neon ? '#c9e9f9' : '#334155'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('请先启用选项',360,370); return;
  }
  for (let index = 0; index < count; index++) {
    const angle = Math.PI * 2 / count; const start = -Math.PI / 2 + index * angle;
    const color = neonColors[index % neonColors.length];
    ctx.beginPath(); ctx.moveTo(360,360); ctx.arc(360,360,350,start,start+angle); ctx.closePath();
    if (neon) {
      const fill = ctx.createRadialGradient(360,360,35,360,360,350);
      fill.addColorStop(0,'#11152f'); fill.addColorStop(0.72,color+'28'); fill.addColorStop(1,color+'80'); ctx.fillStyle = fill;
    } else ctx.fillStyle = basicColors[index % basicColors.length];
    ctx.fill(); ctx.strokeStyle = neon ? color+'99' : '#ffffff'; ctx.lineWidth = neon ? 2 : 1; ctx.stroke();
    if (neon) {
      ctx.beginPath(); ctx.arc(360,360,341,start+0.015,start+angle-0.015); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.save(); ctx.translate(360,360); ctx.rotate(start + angle / 2); ctx.textAlign = 'center';
    ctx.fillStyle = neon ? '#f5fcff' : '#152238'; ctx.font = 'bold ' + (count > 12 ? 16 : 23) + 'px sans-serif';
    if (neon) { ctx.shadowColor = color; ctx.shadowBlur = 9; }
    const label = count > 18 ? String(index + 1) : entries[index].name;
    const chunks = label.match(/.{1,8}/gu);
    chunks.forEach((chunk, line) => {
      // 长名称沿原有扇区中心分行排布
      ctx.fillText(chunk,224,(line-(chunks.length-1)/2)*26,210);
    }); ctx.restore();
  }
  if (neon) {
    for (let tick = 0; tick < 90; tick++) {
      const angle = tick * Math.PI * 2 / 90; const radius = tick % 5 === 0 ? 325 : 332;
      ctx.beginPath(); ctx.moveTo(360+Math.cos(angle)*radius,360+Math.sin(angle)*radius);
      ctx.lineTo(360+Math.cos(angle)*336,360+Math.sin(angle)*336); ctx.strokeStyle='#ffffff80'; ctx.lineWidth=2; ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.arc(360,360,44,0,Math.PI*2); ctx.fillStyle=neon?'#0b142d':'#fff'; ctx.fill();
}
export function clearCelebration(view) {
  // 皮肤切换或再次抽签时释放上一轮粒子动画和节点
  view.querySelectorAll('.prize-particle').forEach(node => {
    node.getAnimations().forEach(animation => animation.cancel()); node.remove();
  });
}
export function celebrate(view) {
  // 使用有限数量和时长的粒子，避免后台持续绘制
  clearCelebration(view);
  if (view.dataset.skin !== 'neon' || reducedMotion()) return;
  const layer = view.querySelector('.wheel-particles');
  for (let index = 0; index < 38; index++) {
    const node = document.createElement('i'); node.className = 'prize-particle'; node.style.background=neonColors[index%neonColors.length]; layer.append(node);
    const angle = index * Math.PI * 2 / 38; const radius = 75 + Math.random()*135;
    const x=Math.cos(angle)*radius; const y=Math.sin(angle)*radius;
    const animation=node.animate([
      {transform:'translate(0,0) rotate(0deg) scale(.2)',opacity:0},
      {transform:'translate('+x*.55+'px,'+y*.55+'px) rotate(120deg) scale(1)',opacity:1,offset:.2},
      {transform:'translate('+x+'px,'+(y+95)+'px) rotate(340deg) scale(.3)',opacity:0}
    ],{duration:1400+Math.random()*500,easing:'cubic-bezier(.16,.7,.35,1)',fill:'forwards'});
    animation.onfinish=() => {
      // 动画结束立即释放节点，不保留累积的特效对象
      node.remove();
    };
  }
}
