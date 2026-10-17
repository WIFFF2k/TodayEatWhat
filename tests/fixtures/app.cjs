// 对每个场景恢复独立临时库，不访问正式数据
const { test: base, expect } = require('@playwright/test');
const { database } = require('../helpers/browser.cjs');
function resetDatabase() {
  // 清理临时业务数据并恢复当前项目的原始候选
  const db = database();
  db.exec("DELETE FROM memories; DELETE FROM poll_ballots; DELETE FROM poll_choices; DELETE FROM polls; DELETE FROM spin_records; DELETE FROM option_logs WHERE option_id>12 OR action<>'add'; DELETE FROM options WHERE id>12; UPDATE options SET enabled=1,deleted_at=NULL,name=(SELECT new_name FROM option_logs WHERE option_id=options.id AND action='add');");
  db.prepare('UPDATE settings SET value=? WHERE key=?').run('single','pollMode'); db.prepare('UPDATE settings SET value=? WHERE key=?').run('60','pollMinutes'); db.close();
}
const test = base.extend({
  isolatedDatabase: [async ({}, use) => {
    // 自动夹具每个用例执行一次，不受模块缓存和文件加载顺序影响
    resetDatabase(); await use();
  }, { auto: true }]
});
module.exports = { test, expect };
