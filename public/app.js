// 启动登录与唯一的页面同步计时器
import { login, showLoadError } from './application/session.js';
import { sync } from './application/sync.js';
setInterval(sync, 3000);
login().catch(showLoadError);
