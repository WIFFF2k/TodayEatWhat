// 在业务接口入口验证中文姓名白名单
const { hasUser } = require('../modules/identity/repositories/users');
module.exports = function authenticate(req, res, next) {
  // 统一解码中文姓名并验证白名单
  let name;
  try { name = decodeURIComponent(req.get('x-user-name') || '').trim(); }
  catch (error) { if (!(error instanceof URIError)) return next(error); return next(Object.assign(new Error('姓名编码错误，请刷新页面重新选择'), { status: 400, errorCode: 'USER_ENCODING_INVALID' })); }
  if (!name) return next(Object.assign(new Error('请先选择姓名'), { status: 401, errorCode: 'USER_REQUIRED' }));
  if (!hasUser(name)) return next(Object.assign(new Error('姓名不在白名单中，请重新选择'), { status: 401, errorCode: 'USER_NOT_ALLOWED' }));
  req.userName = name; next();
};
