// 装配转盘接口
const router = require('express').Router();
const { spin } = require('./services/wheel');
router.post('/spins', (req, res) => {
  // 返回唯一持久化的抽签结果
  res.status(201).json(spin(req.body, req.userName));
});
module.exports = router;
