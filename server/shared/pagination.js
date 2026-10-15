// 校验列表分页偏移量
const { fail } = require('./errors');
function offsetOf(req) {
  // 校验分页位置，避免负数与非整数查询
  const value = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'PAGE_INVALID', '分页位置无效');
  return value;
}
module.exports = { offsetOf };
