// 装配历史记录只读接口
const router = require('express').Router();
const { records } = require('./repositories/records');
const { offsetOf } = require('../../shared/pagination');
router.get('/records', (req,res) => {
  // 按页读取记录
  res.json(records(offsetOf(req)));
});
module.exports = router;
