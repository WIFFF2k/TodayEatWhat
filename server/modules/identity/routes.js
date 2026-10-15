// 提供登录白名单和启动信息
const router = require('express').Router();
const { bootstrap } = require('./services/identity');
router.get('/bootstrap', (req, res) => {
  // 提供登录所需白名单与统一时间信息
  res.json(bootstrap());
});
module.exports = router;
