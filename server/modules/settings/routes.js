// 装配全局设置接口
const router = require('express').Router();
const { settings } = require('./repositories/settings');
const { saveSettings } = require('./services/settings');
router.get('/settings', (req, res) => {
  // 获取全局配置
  res.json(settings());
});
router.put('/settings', (req, res) => {
  // 更新新投票使用的配置
  res.json(saveSettings(req.body));
});
module.exports = router;
