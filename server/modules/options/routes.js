// 装配选项接口，HTTP 以外的规则集中在服务
const router = require('express').Router();
const service = require('./services/options');
const { options } = require('./repositories/options');
router.get('/options', (req, res) => {
  // 返回选项服务结果
  res.json(options());
});
router.get('/option-logs', (req, res) => {
  // 返回选项服务结果
  res.json(service.listLogs(req.query));
});
router.post('/options', (req, res) => {
  // 返回选项服务结果
  res.status(201).json(service.createOption(req.body, req.userName));
});
router.patch('/options/:id', (req, res) => {
  // 返回选项服务结果
  res.json(service.updateOption(req.params.id, req.body, req.userName));
});
router.delete('/options/:id', (req, res) => {
  // 返回选项服务结果
  res.json(service.deleteOption(req.params.id, req.body, req.userName));
});
module.exports = router;
