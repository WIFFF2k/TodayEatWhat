// 统一构造有状态码及业务编码的错误
function fail(status, errorCode, message) {
  // 将明确的业务错误交给统一响应入口
  const error = new Error(message); Object.assign(error, { status, errorCode }); throw error;
}
module.exports = { fail };
