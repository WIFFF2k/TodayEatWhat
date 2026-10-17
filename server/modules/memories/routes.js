// 装配吃饭回忆帖子接口
const router = require('express').Router();
const { memories } = require('./repositories/memories');
const { createMemory, removeMemory } = require('./services/memories');
const { offsetOf } = require('../../shared/pagination');

router.get('/memories', (req, res) => {
  // 按页读取最新回忆帖
  res.json(memories(offsetOf(req)));
});

router.post('/memories', (req, res) => {
  // 发布新回忆帖
  res.status(201).json(createMemory(req.body, req.userName));
});

router.delete('/memories/:id', (req, res) => {
  // 只允许作者删除自己的帖子
  res.json(removeMemory(Number(req.params.id), req.userName));
});

module.exports = router;
