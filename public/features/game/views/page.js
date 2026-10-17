// 经典纵向飞机大战页面，死亡和通关分别接入转盘结果
import { state } from '../../../shared/state.js';
import { api, post } from '../../../shared/api.js';
import { escape } from '../../../shared/display.js';
import { busy, failure, navigate, toast } from '../../../shared/interaction.js';
import { edit } from '../../options/components/editor.js';
import { createAircraftRenderer } from '../renderers/aircraft.js';

const ENEMY_STYLES = [
  { color: '#ff477e', variant: 0 }, { color: '#ff8c42', variant: 1 },
  { color: '#ffd166', variant: 2 }, { color: '#7bd88f', variant: 0 },
  { color: '#35d0ba', variant: 1 }, { color: '#49c6ff', variant: 2 },
  { color: '#6875f5', variant: 0 }, { color: '#b06cff', variant: 1 },
  { color: '#f472b6', variant: 2 }, { color: '#e5e7eb', variant: 0 }
];
const DIFFICULTIES = {
  novice: { label: '新手', enemies: 6, speed: .72, spawn: 1.3, bullet: 2.8, health: 5, mission: 3000 },
  easy: { label: '简单', enemies: 9, speed: .86, spawn: 1.05, bullet: 2.4, health: 4, mission: 3500 },
  normal: { label: '中等', enemies: 12, speed: 1, spawn: .86, bullet: 2, health: 3, mission: 4200 },
  hard: { label: '困难', enemies: 16, speed: 1.18, spawn: .68, bullet: 1.65, health: 3, mission: 5000 },
  hell: { label: '地狱', enemies: 22, speed: 1.4, spawn: .5, bullet: 1.25, health: 2, mission: 6200 }
};

export async function renderGame(view) {
  // 加载分类并装配纵向射击游戏界面
  const failureOptions = await api('/game-failure-options');
  const categories = state.categories.map(item => '<option value="' + escape(item.key) + '">' + escape(item.label) + '</option>').join('');
  view.innerHTML = '<div class="card game-card"><div class="game-heading"><div><p class="game-eyebrow">201 · 星际空战</p><h2>今日空战</h2><p class="muted">自由移动、持续射击，飞到终点赢得今天的转盘结果。</p></div></div><div class="game-settings"><div class="game-selects"><label class="game-category">用餐方式<select id="gameCategory">' + categories + '</select></label><label>难度<select id="gameDifficulty"><option value="novice">新手</option><option value="easy">简单</option><option value="normal">中等</option><option value="hard">困难</option><option value="hell">地狱</option></select></label></div><p class="game-parameters" id="gameParameters"></p></div><div class="game-stage"><div class="game-hud"><span id="gameDifficultyHud">中等 · 12 架</span><span id="gameHealthHud">HP 3/3</span><strong id="gameScore">000000</strong><span id="gameProgress">MISSION 0%</span></div><canvas id="gameCanvas" width="900" height="520" tabindex="0" aria-label="经典飞机大战"></canvas></div><div class="game-actions"><button class="btn" id="gameStart">起飞</button><button class="btn secondary" id="gamePause" disabled>暂停</button></div><p class="game-status" id="gameStatus" role="status">方向键或 WASD 自由移动，战机会自动射击</p><div id="gameResult" aria-live="polite"></div></div><div class="card option-group game-pool-card" data-category="pending"><h2>失败结果池</h2><form class="row" id="gamePoolAddForm"><label class="field">结果名称<input id="gamePoolName" maxlength="60" required placeholder="填写失败结果"></label><button class="btn" type="submit">添加选项</button></form><p class="muted">启用的选项会生成对应敌机，碰撞后锁定该结果；改名、删除和勾选对所有人共享</p><div class="game-pool-list" id="gamePoolGroup"></div><dialog id="optionDialog" aria-labelledby="optionDialogTitle"><form id="optionEditForm"><h2 id="optionDialogTitle"></h2><p id="optionEditDescription"></p><label class="field" id="renameField">新名称<input id="renameName" maxlength="60" required></label><p id="optionEditError" role="alert"></p><div class="row"><button class="btn" type="submit" id="optionConfirm"></button><button class="btn secondary" type="button" id="optionCancel">取消</button></div></form></dialog></div>';
  view._gameFailureOptions = failureOptions;
  fillGamePool(view);
  bindGamePool(view);
  return setupGame(view);
}

function fillGamePool(view) {
  // 按待定分类的共享选项样式渲染独立失败结果池
  const group = view.querySelector('#gamePoolGroup');
  const items = view._gameFailureOptions;
  group.innerHTML = items.length ? items.map(item => '<div class="option-row game-pool-option" style="--game-enemy-color:' + ENEMY_STYLES[item.styleIndex ?? 0].color + '" data-row="' + item.id + '"><label class="option"><input type="checkbox" data-game-option="' + item.id + '" ' + (item.enabled ? 'checked' : '') + '><span>' + escape(item.name) + '</span><small>' + escape(item.addedBy) + '</small></label><div class="option-actions"><button class="btn secondary" data-game-rename="' + item.id + '">重命名</button><button class="btn danger" data-game-delete="' + item.id + '">删除</button></div></div>').join('') : '<p class="muted">暂无选项，可在上方添加</p>';
}

function bindGamePool(view) {
  // 绑定失败结果池的新增、启用、改名和删除操作
  const form = view.querySelector('#gamePoolAddForm');
  form.onsubmit = async event => {
    event.preventDefault(); if (state.busy) return; const input = form.querySelector('#gamePoolName'); busy(true);
    try { const result = await post('/game-failure-options', { name: input.value }); view._gameFailureOptions = result.options; input.value = ''; fillGamePool(view); view._gamePoolChanged?.(); toast('失败结果已添加，大家都能看到'); }
    catch (error) { failure(error); } finally { busy(false); }
  };
  view.querySelector('#gamePoolGroup').addEventListener('change', async event => {
    const input = event.target.closest('[data-game-option]'); if (!input) return;
    if (state.busy) { input.checked = !input.checked; return; }
    const previous = !input.checked; input.disabled = true; busy(true);
    try { const result = await post('/game-failure-options/' + input.dataset.gameOption, { enabled: input.checked }, 'PATCH'); view._gameFailureOptions = result.options; fillGamePool(view); view._gamePoolChanged?.(); }
    catch (error) { input.checked = previous; failure(error); } finally { input.disabled = false; busy(false); }
  });
  view.querySelector('#gamePoolGroup').onclick = event => {
    const button = event.target.closest('[data-game-rename],[data-game-delete]'); if (!button || state.busy) return;
    const action = button.dataset.gameRename ? 'rename' : 'delete'; const item = view._gameFailureOptions.find(option => option.id === Number(button.dataset[action === 'rename' ? 'gameRename' : 'gameDelete']));
    if (!item) return;
    edit(view, item, action, async () => { view._gameFailureOptions = await api('/game-failure-options'); fillGamePool(view); view._gamePoolChanged?.(); }, { base: '/game-failure-options' });
  };
}

function setupGame(view) {
  // 初始化纵向射击、敌机编队、子弹和特效状态
  const canvas=view.querySelector('#gameCanvas');const ctx=canvas.getContext('2d');const category=view.querySelector('#gameCategory');const difficulty=view.querySelector('#gameDifficulty');const parameters=view.querySelector('#gameParameters');const difficultyHud=view.querySelector('#gameDifficultyHud');const healthHud=view.querySelector('#gameHealthHud');const start=view.querySelector('#gameStart');const pause=view.querySelector('#gamePause');const status=view.querySelector('#gameStatus');const result=view.querySelector('#gameResult');const score=view.querySelector('#gameScore');const progress=view.querySelector('#gameProgress');const aircraft=createAircraftRenderer();
  const game={active:false,paused:false,ended:false,raf:0,last:0,distance:0,score:0,spawn:0,fire:0,spin:null,keys:new Set(),player:{x:450,y:455,w:38,h:52,health:3,maxHealth:3},goal:{active:false,x:450,y:-70,w:78,h:78,vy:105},enemies:[],bullets:[],particles:[],config:DIFFICULTIES.normal,pool:[]};
  const saved=JSON.parse(localStorage.getItem('eat-game-settings')||'null');if(saved?.difficulty&&DIFFICULTIES[saved.difficulty])difficulty.value=saved.difficulty;
  const updateSettings=()=>{game.config=DIFFICULTIES[difficulty.value];game.pool=view._gameFailureOptions.filter(item=>item.enabled).map((item,index)=>({...item,...ENEMY_STYLES[item.styleIndex ?? index]}));parameters.textContent='飞机数量 '+game.config.enemies+' 架 · 敌机速度 '+Math.round(game.config.speed*100)+'% · 子弹间隔 '+game.config.bullet+' 秒 · 初始血量 '+game.config.health;difficultyHud.textContent=game.config.label+' · '+game.config.enemies+' 架';if(!game.active)healthHud.textContent='HP '+game.config.health+'/'+game.config.health;localStorage.setItem('eat-game-settings',JSON.stringify({difficulty:difficulty.value}));};
  const reset=()=>{game.active=false;game.paused=false;game.ended=false;game.distance=0;game.score=0;game.spawn=0;game.fire=0;game.spin=null;game.keys.clear();game.player.x=450;game.player.y=455;game.player.maxHealth=game.config.health;game.player.health=game.config.health;game.goal.active=false;game.goal.x=450;game.goal.y=-70;game.enemies=[];game.bullets=[];game.particles=[];start.disabled=false;start.textContent='起飞';pause.disabled=true;pause.textContent='暂停';category.disabled=false;difficulty.disabled=false;score.textContent='000000';progress.textContent='MISSION 0%';healthHud.textContent='HP '+game.player.health+'/'+game.player.maxHealth;status.textContent='方向键或 WASD 自由移动，战机会自动射击';result.innerHTML='';draw();};
  const fire=()=>{game.bullets.push({x:game.player.x,y:game.player.y-30,vy:-650,from:'player',w:5,h:18});};
  const spawnEnemy=()=>{game.pool=view._gameFailureOptions.filter(item=>item.enabled).map((item,index)=>({...item,...ENEMY_STYLES[item.styleIndex ?? index]}));const type=game.pool[Math.floor(Math.random()*game.pool.length)];if(!type)return;game.enemies.push({...type,x:65+Math.random()*770,y:-55,baseX:65+Math.random()*770,phase:Math.random()*8,vy:(72+Math.random()*50)*game.config.speed,shot:game.config.bullet,w:55,h:48});};
  const intersects=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.y-b.y)<(a.h+b.h)/2;
  const burst=(x,y,color,amount=20)=>{for(let i=0;i<amount;i++)game.particles.push({x,y,vx:(Math.random()-.5)*300,vy:(Math.random()-.5)*300,life:.45+Math.random()*.45,color});};
  const showPoll=()=>{result.insertAdjacentHTML('beforeend','<div class="game-poll-action"><button class="btn secondary" id="gamePoll">发起投票</button></div>');result.querySelector('#gamePoll').onclick=async()=>{if(state.busy)return;busy(true);try{const poll=await post('/polls',{spinId:game.spin.id});navigate('投票',poll.id);toast('投票已发起');}catch(error){failure(error);}finally{busy(false);}};};
  const settle=async(kind,enemyName='')=>{game.active=false;game.ended=true;cancelAnimationFrame(game.raf);pause.disabled=true;category.disabled=false;difficulty.disabled=false;busy(true);try{game.spin=await post('/spins',enemyName?{category:category.value,optionName:enemyName}:{category:category.value});state.lastSpin=game.spin;if(kind==='death'){status.textContent='战机坠毁，结果已锁定';result.innerHTML='<div class="game-death"><span>'+(enemyName?'你撞到了「'+escape(enemyName)+'」敌机':'你被敌方火力击落')+'</span><strong>今天吃：'+escape(game.spin.winner.name)+'</strong><small>'+(enemyName?'这架敌机决定了本局结果':'本局随机结果已保存')+'</small></div>';burst(game.player.x,game.player.y,'#ff477e',42);}else{status.textContent='突破终点，任务完成';result.innerHTML='<div class="game-victory"><span>任务完成 · 转盘结果</span><strong>'+escape(game.spin.winner.name)+'</strong><small>你成功飞过终点航线，今天就吃这个！</small></div>';burst(game.player.x,game.player.y,'#ffe27a',60);toast('空战完成：'+game.spin.winner.name);}showPoll();}catch(error){status.textContent='结果保存失败';failure(error);}finally{busy(false);start.disabled=false;start.textContent='重新起飞';draw();}};
  const damage=()=>{game.player.health--;healthHud.textContent='HP '+game.player.health+'/'+game.player.maxHealth;burst(game.player.x,game.player.y,'#ffbf47',10);if(game.player.health<=0)die({});};
  const die=enemy=>{if(!game.active)return;burst(game.player.x,game.player.y,'#ff477e',42);const pool=view._gameFailureOptions.filter(item=>item.enabled);const resultName=enemy?.name||pool[Math.floor(Math.random()*pool.length)]?.name||'';settle('death',resultName);};
  const update=now=>{if(!game.active||game.paused)return;const dt=Math.min((now-game.last)/1000,.04);game.last=now;if(!game.goal.active)game.distance+=120*dt;game.spawn-=dt;game.fire-=dt;const p=game.player;if(game.keys.has('ArrowLeft')||game.keys.has('KeyA'))p.x-=350*dt;if(game.keys.has('ArrowRight')||game.keys.has('KeyD'))p.x+=350*dt;if(game.keys.has('ArrowUp')||game.keys.has('KeyW'))p.y-=300*dt;if(game.keys.has('ArrowDown')||game.keys.has('KeyS'))p.y+=300*dt;p.x=Math.max(32,Math.min(868,p.x));p.y=Math.max(32,Math.min(488,p.y));if(game.fire<=0){fire();game.fire=.22;}if(!game.goal.active&&game.spawn<=0&&game.enemies.length<game.config.enemies){spawnEnemy();game.spawn=Math.max(.25,game.config.spawn-game.distance/12000);}if(!game.goal.active&&game.distance>=game.config.mission){game.goal.active=true;game.goal.x=110+Math.random()*680;game.goal.y=-70;status.textContent='终点星门已出现，触碰它领取最终结果';}if(game.goal.active){game.goal.y+=game.goal.vy*dt;if(game.goal.y>590){game.goal.x=110+Math.random()*680;game.goal.y=-70;}if(intersects(p,game.goal)){settle('victory');return;}}for(const enemy of game.enemies){enemy.phase+=dt;enemy.y+=enemy.vy*dt;enemy.x=enemy.baseX+Math.sin(enemy.phase)*70;enemy.shot-=dt;if(enemy.shot<=0){game.bullets.push({x:enemy.x,y:enemy.y+22,vy:230*game.config.speed,from:'enemy',w:8,h:18});enemy.shot=game.config.bullet+Math.random()*.8;}if(intersects(p,enemy)){die(enemy);return;}}for(const bullet of game.bullets){bullet.y+=bullet.vy*dt;if(bullet.from==='player')for(const enemy of game.enemies)if(!bullet.dead&&intersects(bullet,enemy)){bullet.dead=true;enemy.dead=true;game.score+=100;burst(enemy.x,enemy.y,enemy.color,14);}if(game.active&&bullet.from==='enemy'&&intersects(bullet,p)){bullet.dead=true;damage();}}game.enemies=game.enemies.filter(enemy=>!enemy.dead&&enemy.y<590);game.bullets=game.bullets.filter(bullet=>!bullet.dead&&bullet.y>-50&&bullet.y<570);for(const particle of game.particles){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vy+=200*dt;particle.life-=dt;}game.particles=game.particles.filter(particle=>particle.life>0);game.score+=Math.floor(dt*8);score.textContent=String(game.score).padStart(6,'0');progress.textContent='MISSION '+Math.min(100,Math.floor(game.distance/game.config.mission*100))+'%';draw();game.raf=requestAnimationFrame(update);};
  const draw=()=>{drawBackground();if(game.goal.active)drawGoal();for(const bullet of game.bullets)drawBullet(bullet);for(const enemy of game.enemies)if(!enemy.dead){aircraft.draw(ctx,enemy.x,enemy.y,enemy.color,false,enemy.variant,Math.sin(enemy.phase)*.15);drawHealth(enemy);}for(const particle of game.particles){ctx.globalAlpha=Math.max(0,particle.life*1.8);ctx.fillStyle=particle.color;ctx.fillRect(particle.x,particle.y,5,5);}ctx.globalAlpha=1;aircraft.draw(ctx,game.player.x,game.player.y,'#49d6ff',true,0,0);drawPlayerHealth();if(!game.active&&!game.ended)overlay('准备起飞');if(game.paused)overlay('已暂停');};
  const drawBackground=()=>{ctx.clearRect(0,0,900,520);const bg=ctx.createLinearGradient(0,0,0,520);bg.addColorStop(0,'#061329');bg.addColorStop(1,'#173261');ctx.fillStyle=bg;ctx.fillRect(0,0,900,520);ctx.fillStyle='#83dfff';for(let i=0;i<70;i++){const x=(i*137)%900;const y=(i*89+game.distance*(1+i%3))%520;ctx.globalAlpha=.2+(i%4)*.12;ctx.fillRect(x,y,2,7+i%5*3);}ctx.globalAlpha=1;};
  const drawGoal=()=>{const g=game.goal;const pulse=1+Math.sin(performance.now()/180)*.08;ctx.save();ctx.translate(g.x,g.y);ctx.scale(pulse,pulse);ctx.shadowBlur=28;ctx.shadowColor='#ffe47a';ctx.strokeStyle='#ffe47a';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=12;ctx.strokeStyle='#78f3ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff4b0';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(8,0);ctx.lineTo(0,12);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();ctx.restore();};
  const drawBullet=bullet=>{ctx.shadowBlur=14;ctx.shadowColor=bullet.from==='player'?'#62f4ff':'#ff567e';ctx.fillStyle=bullet.from==='player'?'#e4ffff':'#ff7894';ctx.fillRect(bullet.x-2,bullet.y-10,4,20);ctx.shadowBlur=0;};
  const drawHealth=enemy=>{ctx.fillStyle='#fff';ctx.globalAlpha=.65;ctx.fillRect(enemy.x-25,enemy.y-36,50,3);ctx.globalAlpha=1;};
  const drawPlayerHealth=()=>{ctx.fillStyle='#fff';ctx.globalAlpha=.7;ctx.fillRect(game.player.x-30,game.player.y+36,60,5);ctx.globalAlpha=1;ctx.fillStyle='#53e6a5';ctx.fillRect(game.player.x-30,game.player.y+36,60*(game.player.health/game.player.maxHealth),5);};
  const overlay=text=>{ctx.fillStyle='#d4eaff';ctx.font='700 24px Microsoft YaHei';ctx.textAlign='center';ctx.fillText(text,450,250);};
  const begin=()=>{if(game.active||state.busy)return;reset();state.category=category.value;game.active=true;start.disabled=true;pause.disabled=false;category.disabled=true;difficulty.disabled=true;status.textContent='航线推进中，自动射击已开启';game.last=performance.now();game.raf=requestAnimationFrame(update);canvas.focus({preventScroll:true});};
  difficulty.onchange=updateSettings;start.onclick=begin;pause.onclick=()=>{game.paused=!game.paused;pause.textContent=game.paused?'继续':'暂停';if(!game.paused){game.last=performance.now();game.raf=requestAnimationFrame(update);}};canvas.onpointermove=event=>{if(!game.active||game.paused)return;const rect=canvas.getBoundingClientRect();game.player.x=Math.max(32,Math.min(868,(event.clientX-rect.left)/rect.width*900));game.player.y=Math.max(32,Math.min(488,(event.clientY-rect.top)/rect.height*520));};category.value=state.category;view._gameKeydown=event=>{if(!view.isConnected)return;if(event.target.closest('select,button,input'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD'].includes(event.code)){event.preventDefault();game.keys.add(event.code);}};view._gameKeyup=event=>game.keys.delete(event.code);document.addEventListener('keydown',view._gameKeydown);document.addEventListener('keyup',view._gameKeyup);const clearKeys=()=>game.keys.clear();window.addEventListener('blur',clearKeys);updateSettings();reset();return()=>{cancelAnimationFrame(game.raf);document.removeEventListener('keydown',view._gameKeydown);document.removeEventListener('keyup',view._gameKeyup);window.removeEventListener('blur',clearKeys);aircraft.dispose();};
}
