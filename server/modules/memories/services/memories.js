// 回忆帖输入校验与业务编排
const { fail } = require('../../../shared/errors');
const { hasUser } = require('../../identity/repositories/users');
const repo = require('../repositories/memories');

const MAX_TITLE = 60;
const MAX_CONTENT = 500;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_PREFIX = 'data:image/';
const IMAGE_SIGNATURES = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function text(value, label) {
  // 提交内容统一按文字处理，并做类型校验
  if (typeof value !== 'string') fail(400, 'MEMORY_CONTENT_INVALID', label + '必须是文字');
  return value.trim();
}

function validateTitle(value) {
  // 标题必填且限制长度，便于信息流排版
  const title = text(value, '标题');
  if (!title || title.length > MAX_TITLE) fail(400, 'MEMORY_TITLE_INVALID', '标题需要 1～60 个字');
  return title;
}

function validateContent(value) {
  // 感想可选，留空统一为空字符串
  if (value === undefined || value === null) return '';
  const content = text(value, '感想');
  if (content.length > MAX_CONTENT) fail(400, 'MEMORY_CONTENT_INVALID', '感想最多 500 个字');
  return content;
}

function validateParticipants(value) {
  // 参与人员必须是白名单姓名的去重数组
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(name => typeof name !== 'string')) {
    fail(400, 'MEMORY_PARTICIPANTS_INVALID', '参与人员必须是姓名数组');
  }
  const trimmed = value.map(name => name.trim()).filter(Boolean);
  for (const name of trimmed) {
    if (!hasUser(name)) fail(400, 'MEMORY_PARTICIPANTS_INVALID', '参与人员「' + name + '」不在白名单中');
  }
  return [...new Set(trimmed)];
}

function validatePhoto(value) {
  // 照片必须是小于等于 3MB 的内联图片，并按文件头识别类型
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.startsWith(PHOTO_PREFIX)) {
    fail(400, 'MEMORY_PHOTO_INVALID', '照片必须是图片文件');
  }
  const comma = value.indexOf(',');
  if (comma < 0) fail(400, 'MEMORY_PHOTO_INVALID', '照片数据不完整');
  let buffer;
  try { buffer = Buffer.from(value.slice(comma + 1), 'base64'); }
  catch { fail(400, 'MEMORY_PHOTO_INVALID', '照片数据不完整'); }
  if (!buffer.length) fail(400, 'MEMORY_PHOTO_INVALID', '照片内容为空');
  if (buffer.length > MAX_PHOTO_BYTES) fail(400, 'MEMORY_PHOTO_TOO_LARGE', '照片不能超过 3MB');
  if (!IMAGE_SIGNATURES.some(item => item.bytes.every((byte, index) => buffer[index] === byte))) {
    fail(400, 'MEMORY_PHOTO_INVALID', '暂只支持 PNG、JPG、GIF 或 WebP 图片');
  }
  return value;
}

function createMemory(body, userName) {
  // 校验后落库，返回新帖完整数据
  if (!body || typeof body !== 'object') fail(400, 'MEMORY_CONTENT_INVALID', '提交内容格式错误');
  const title = validateTitle(body.title);
  const content = validateContent(body.content);
  const participants = validateParticipants(body.participants);
  const photo = validatePhoto(body.photo);
  const id = repo.createMemory({ userName, title, content, participants, photo });
  return { id, userName, title, content, participants, photo, createdAt: Date.now() };
}

function removeMemory(id, userName) {
  // 删除前确认编号和作者身份
  if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'MEMORY_ID_INVALID', '帖子编号无效');
  const owner = repo.memoryOwner(id);
  if (!owner) fail(404, 'MEMORY_NOT_FOUND', '回忆帖不存在或已被删除');
  if (owner !== userName) fail(403, 'MEMORY_NOT_OWNER', '只能删除自己发布的回忆帖');
  repo.deleteMemory(id);
  return { ok: true };
}

module.exports = { createMemory, removeMemory };
