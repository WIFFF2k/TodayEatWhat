// memories 表的分页查询与写入
const db = require('../../../database');
const { timestamp } = require('../../../shared/time');

const PAGE_SIZE = 30;

function memories(offset) {
  // 按发帖时间倒序分页，照片以内联数据 URL 返回
  const rows = db.prepare('SELECT id,user_name AS userName,title,content,participants,photo,created_at AS createdAt FROM memories ORDER BY id DESC LIMIT ? OFFSET ?').all(PAGE_SIZE, offset);
  return rows.map(row => ({
    id: row.id,
    userName: row.userName,
    title: row.title,
    content: row.content,
    participants: JSON.parse(row.participants),
    photo: row.photo,
    createdAt: timestamp(row.createdAt),
  }));
}

function createMemory({ userName, title, content, participants, photo }) {
  // 帖子内容在服务层完成校验，这里只负责落库
  const result = db.prepare('INSERT INTO memories (user_name,title,content,participants,photo) VALUES (?,?,?,?,?)')
    .run(userName, title, content, JSON.stringify(participants), photo);
  return Number(result.lastInsertRowid);
}

function memoryOwner(id) {
  // 读取作者用于删除校验
  const row = db.prepare('SELECT user_name FROM memories WHERE id = ?').get(id);
  return row ? row.user_name : null;
}

function deleteMemory(id) {
  // 直接删除帖子；当前产品没有回收站需求
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

module.exports = { memories, createMemory, memoryOwner, deleteMemory, PAGE_SIZE };
