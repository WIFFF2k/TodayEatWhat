// 吃饭回忆：发布与浏览共享回忆帖
import { state } from '../../../shared/state.js';
import { api, post } from '../../../shared/api.js';
import { escape, time, now } from '../../../shared/display.js';
import { toast, failure, busy } from '../../../shared/interaction.js';

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
let viewMode = localStorage.getItem('eat-memory-view') === 'timeline' ? 'timeline' : 'feed';
let cachedItems = null;

export async function renderMemories(view) {
  // 读取帖子并渲染当前视图；重复进入页面时重新读取
  cachedItems = null;
  const items = await api('/memories?offset=0');
  cachedItems = items;
  view.innerHTML =
    '<div class="card memory-composer"><h2>记录一次好吃的</h2>' +
    '<form id="memoryForm" enctype="multipart/form-data"><div class="row">' +
    '<label class="field memory-grow">标题<input id="memoryTitle" maxlength="60" required placeholder="例如：周五的火锅局"></label>' +
    '<label class="field">参与人员（可多选）<select id="memoryPeople" multiple size="1">' +
    state.members.map(name => '<option value="' + escape(name) + '">' + escape(name) + '</option>').join('') +
    '</select></label></div>' +
    '<label class="field">感想<textarea id="memoryContent" rows="3" maxlength="500" placeholder="吃了什么、和谁、感受如何…"></textarea></label>' +
    '<div class="row"><label class="btn secondary memory-photo-btn">📷 选择照片<input id="memoryPhoto" type="file" accept="image/*" hidden></label>' +
    '<span id="memoryPhotoName" class="muted">未选择照片（可选，最大 3MB）</span>' +
    '<button class="btn" type="submit">发布回忆</button></div></form></div>' +
    '<div class="row memory-view-switch" role="tablist"><button class="btn" id="viewFeed">card 信息流</button>' +
    '<button class="btn secondary" id="viewTimeline">🕘 时间轴</button></div>' +
    '<div id="memoryFeed"></div>';
  fillFeed(view, items);
  bindComposer(view);
  view.querySelector('#viewFeed').onclick = () => switchView(view, 'feed');
  view.querySelector('#viewTimeline').onclick = () => switchView(view, 'timeline');
}

function fillFeed(view, items) {
  // 按当前视图模式渲染信息流或时间轴
  const feed = view.querySelector('#memoryFeed');
  view.querySelector('#viewFeed').className = 'btn' + (viewMode === 'feed' ? '' : ' secondary');
  view.querySelector('#viewTimeline').className = 'btn' + (viewMode === 'timeline' ? '' : ' secondary');
  if (!items.length) { feed.innerHTML = '<div class="card muted">还没有回忆，发第一帖吧！</div>'; return; }
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  feed.className = viewMode === 'feed' ? 'memory-masonry' : 'memory-timeline';
  feed.innerHTML = viewMode === 'feed' ? masonryCards(sorted) : timelineHTML(sorted);
  bindCards(feed, sorted);
}

function masonryCards(items) {
  // CSS 多列瀑布流，卡片按列排列且互不重叠
  return items.map(item => memoryCard(item)).join('');
}

function timelineHTML(items) {
  // 从上往下居中时间轴：轴在中间，帖子左右交替，最近的在最上面
  return items.map((item, index) => {
    const side = index % 2 === 0 ? 'left' : 'right';
    return '<div class="memory-time-item memory-side-' + side + '">' +
      '<div class="memory-dot" aria-hidden="true"></div>' +
      '<div class="memory-time-card">' + memoryCard(item) + '</div></div>';
  }).join('');
}

function memoryCard(item) {
  // 卡片包含照片、标题、感想、人员和作者操作
  const mine = item.userName === state.user;
  return '<article class="card memory-card" data-id="' + item.id + '">' +
    (item.photo ? '<img class="memory-photo" src="' + escape(item.photo) + '" alt="回忆照片">' : '') +
    '<h3>' + escape(item.title) + '</h3>' +
    (item.content ? '<p class="memory-text">' + escape(item.content) + '</p>' : '') +
    (item.participants.length ? '<div class="memory-people">' + item.participants.map(name => '<span class="memory-chip">' + escape(name) + '</span>').join('') + '</div>' : '') +
    '<div class="memory-meta"><span class="memory-avatar">' + escape(item.userName.slice(0, 1)) + '</span>' +
    '<span class="memory-author">' + escape(item.userName) + '</span><span class="muted">' + time(item.createdAt) + '</span>' +
    (mine ? '<button class="btn danger memory-delete" data-delete="' + item.id + '">删除</button>' : '') +
    '</div></article>';
}

function bindCards(feed, items) {
  // 删除按钮只对作者可见，操作期间保持锁定
  feed.querySelectorAll('[data-delete]').forEach(button => {
    button.onclick = async () => {
      if (state.busy) return;
      const id = Number(button.dataset.delete);
      button.disabled = true; busy(true);
      try {
        await api('/memories/' + id, { method: 'DELETE' });
        cachedItems = cachedItems.filter(item => item.id !== id);
        const container = document.querySelector('#memoryFeed');
        fillFeed(container.parentElement, cachedItems);
        toast('回忆已删除');
      }
      catch (error) { button.disabled = false; failure(error); }
      finally { busy(false); }
    };
  });
}

function bindComposer(view) {
  // 照片即时转成数据 URL，提交时一起发送
  const photoInput = view.querySelector('#memoryPhoto');
  const photoName = view.querySelector('#memoryPhotoName');
  let photoData = null;
  photoInput.onchange = () => {
    const file = photoInput.files && photoInput.files[0];
    photoData = null;
    if (!file) { photoName.textContent = '未选择照片（可选，最大 3MB）'; return; }
    if (file.size > MAX_PHOTO_BYTES) { photoData = null; photoInput.value = ''; photoName.textContent = '照片超过 3MB，请重新选择'; return; }
    const reader = new FileReader();
    reader.onload = () => { photoData = reader.result; photoName.textContent = file.name; };
    reader.onerror = () => { photoName.textContent = '照片读取失败，请重新选择'; };
    reader.readAsDataURL(file);
  };
  view.querySelector('#memoryForm').onsubmit = async event => {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const button = form.querySelector('button[type=submit]');
    const people = [...view.querySelector('#memoryPeople').selectedOptions].map(option => option.value);
    button.disabled = true; busy(true);
    try {
      await post('/memories', { title: form.querySelector('#memoryTitle').value, content: form.querySelector('#memoryContent').value, participants: people, photo: photoData });
      form.querySelector('#memoryTitle').value = ''; form.querySelector('#memoryContent').value = '';
      view.querySelector('#memoryPeople').selectedIndex = -1;
      photoInput.value = ''; photoData = null; photoName.textContent = '未选择照片（可选，最大 3MB）';
      const items = await api('/memories?offset=0');
      cachedItems = items;
      fillFeed(view, items);
      toast('回忆已发布');
    } catch (error) { failure(error); }
    finally { button.disabled = false; busy(false); }
  };
}

function switchView(view, mode) {
  // 记住偏好并只重绘列表，不打断表单输入
  viewMode = mode;
  localStorage.setItem('eat-memory-view', mode);
  fillFeed(view, cachedItems || []);
}
