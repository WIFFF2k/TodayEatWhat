// 补齐姓名白名单和默认投票设置
module.exports = function seed(db) {
  // 在首次启动时补充白名单与初始选项，不重置已有配置
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)');
  const users = [
    '张圣楚', '刘心怡', '杨淑慧', '蔡进', '肖阳', '李民顺', '方杭健', '舒海润', '马烜',
    '居帅', '卜梦恬', '王普瑞', '徐箫炯', '白芸惠', '王岩', '韩铖浩', '宋恩泽',
    '李晨昊', '付俊桥', '肖迪升', '尚佳蕊', '刘宇轩', '原笑哲', '周豪', '常新雨'
  ];
  for (const name of users) insertUser.run(name);

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('pollMode', 'single');
  insertSetting.run('pollMinutes', '60');
};
