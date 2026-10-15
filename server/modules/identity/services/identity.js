// 组合登录时需要的白名单、全局配置和服务器时间
const { users } = require('../repositories/users');
const { settings } = require('../../settings/repositories/settings');
const { mealTitle } = require('../../../shared/time');
const { categories } = require('../../../shared/categories');
function bootstrap() {
  // 登录前只提供启动页面所需数据
  return { users: users(), settings: settings(), categories, serverTime: Date.now(), title: mealTitle() };
}
module.exports = { bootstrap };
