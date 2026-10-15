// 返回明确的接口错误并记录内部故障
module.exports = function errorHandler(error, req, res, next) {
  // 区分输入错误和内部故障，并记录真正的服务错误
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ errorCode: 'JSON_INVALID', error: '提交内容格式错误' });
  if (error.type === 'entity.too.large') return res.status(413).json({ errorCode: 'BODY_TOO_LARGE', error: '提交内容过大' });
  if (error.errorCode) return res.status(error.status).json({ errorCode: error.errorCode, error: error.message });
  console.error(error);
  res.status(500).json({ errorCode: 'SERVER_ERROR', error: '服务处理失败，请查看启动窗口中的错误信息' });
};
