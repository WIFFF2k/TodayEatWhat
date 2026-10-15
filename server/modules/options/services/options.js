// 编排选项写入、并发校验与原子留痕
const { fail } = require('../../../shared/errors');
const { timestamp } = require('../../../shared/time');
const transaction = require('../../../database/transaction');
const { options, getOption, findDuplicate, insertLog, readLogs, insertOption, setEnabled, renameOption, softDelete } = require('../repositories/options');
function validName(value) {
  // 所有写入入口使用一致的名称规则
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) fail(400, 'OPTION_NAME_INVALID', '名称需为 1 到 60 个字');
  return value.trim();
}
function currentOption(idValue, body) {
  // 已被删除的选项不能再次修改，旧页面不能覆盖其他人的重命名
  const id = Number(idValue);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'OPTION_ID_INVALID', '选项编号无效');
  const item = getOption(id);
  if (!item) fail(404, 'OPTION_NOT_FOUND', '选项已删除或不存在，请刷新页面');
  if (body.expectedName !== undefined && body.expectedName !== item.name) fail(409, 'OPTION_CHANGED', '其他人已重命名此选项，请取消后重新操作');
  return item;
}
function uniqueName(name, category, id = 0) {
  // 删除后的名称允许重新添加，同分类的现存名称不能重复
  if (findDuplicate(name, category, id)) fail(409, 'OPTION_DUPLICATE', '该分类已存在同名选项');
}
function listLogs(query) {
  // 每次只读取一页记录，首屏游标固定后续翻页范围
  const before = query.before === undefined ? Number.MAX_SAFE_INTEGER : Number(query.before);
  if (!Number.isSafeInteger(before) || before < 1) fail(400, 'PAGE_INVALID', '记录分页位置无效');
  const rows = readLogs(before);
  const hasMore = rows.length > 30;
  return { items: rows.slice(0,30).map(row => ({ ...row, createdAt: timestamp(row.createdAt) })), hasMore };
}
function createOption(body, actor) {
  // 新增选项和添加留痕同时提交
  const name = validName(body.name); const { category } = body;
  if (!['外卖','出去吃'].includes(category)) fail(400, 'CATEGORY_INVALID', '请选择外卖或出去吃');
  const id = transaction(() => {
    // 查重、选项和日志写入共享同一事务
    uniqueName(name, category);
    const id = Number(insertOption(name, category, actor).lastInsertRowid);
    insertLog({ id, category }, 'add', actor, null, name);
    return id;
  });
  return { id, options: options() };
}
function updateOption(idValue, body, actor) {
  // 勾选和重命名分别提交，避免一次请求混入不明确的操作
  const hasName = Object.hasOwn(body, 'name'); const hasEnabled = Object.hasOwn(body, 'enabled');
  if (hasName === hasEnabled) fail(400, 'OPTION_UPDATE_INVALID', '请单独提交名称或勾选状态');
  const name = hasName ? validName(body.name) : null;
  if (hasEnabled && typeof body.enabled !== 'boolean') fail(400, 'OPTION_STATE_INVALID', '启用状态必须为勾选或取消');
  transaction(() => {
    // 名称变更与留痕整体提交，重复保存同名不产生虚假记录
    const item = currentOption(idValue, body);
    if (hasEnabled) setEnabled(Number(body.enabled), item.id);
    else if (name !== item.name) {
      uniqueName(name, item.category, item.id);
      renameOption(name, item.id);
      insertLog(item, 'rename', actor, item.name, name);
    }
  });
  return { ok: true, options: options() };
}
function deleteOption(idValue, body, actor) {
  // 软删除只影响今后的候选列表，不改写已有抽签与投票快照
  transaction(() => {
    // 删除与留痕任一步失败则整体回滚
    const item = currentOption(idValue, body);
    softDelete(item.id);
    insertLog(item, 'delete', actor, item.name, null);
  });
  return { ok: true, options: options() };
}
module.exports = { listLogs, createOption, updateOption, deleteOption };
