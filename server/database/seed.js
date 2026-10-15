// 补齐姓名白名单、初始选项和默认投票设置
module.exports = function seed(db) {
  // 在首次启动时补充白名单与初始选项，不重置已有配置
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)');
  const users = [
    '张圣楚', '刘心怡', '杨淑慧', '蔡进', '肖阳', '李民顺', '方杭健', '舒海润', '马烜',
    '居帅', '卜梦恬', '王普瑞', '徐箫炯', '白芸惠', '王岩', '韩铖浩', '宋恩泽',
    '李晨昊', '付俊桥', '肖迪升', '尚佳蕊', '刘宇轩', '原笑哲', '周豪', '常新雨'
  ];
  for (const name of users) insertUser.run(name);

  const isEmpty = db.prepare('SELECT COUNT(*) AS count FROM options').get().count === 0;
  if (isEmpty) {
    const insertOption = db.prepare('INSERT INTO options (name, category, added_by) VALUES (?, ?, ?)');
    for (const name of ['大米先生', '紫燕百味鸡', '东北饭盒', '赣湘记', '马香纯兰州拉面（金地太阳城店）', '大碗东北饭盒（京东）']) {
      insertOption.run(name, '外卖', '张圣楚');
    }
    for (const name of ['南昌水煮', '鲁磨路重庆冒菜（串串）', '鲁磨路东北饺子', '西区五号王氏现捞', '荣记广式烧腊', '大米先生']) {
      insertOption.run(name, '出去吃', '张圣楚');
    }
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('pollMode', 'single');
  insertSetting.run('pollMinutes', '60');
};
