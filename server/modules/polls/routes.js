// 装配投票、通知和详情接口
const router = require('express').Router();
const { poll, polls } = require('./repositories/polls');
const { mealTitle } = require('../../shared/time');
const { offsetOf } = require('../../shared/pagination');
const { createPoll, vote } = require('./services/polls');
router.get('/sync', (req, res) => {
  // 仅同步活跃投票通知以及服务器时间
  res.json({ activePolls: polls(req.userName, 0, true), serverTime: Date.now(), title: mealTitle() });
});
router.get('/polls', (req, res) => {
  // 按页返回历史投票
  res.json(polls(req.userName, offsetOf(req)));
});
router.get('/polls/:id', (req, res) => {
  // 直接读取指定投票
  res.json(poll(Number(req.params.id), req.userName));
});
router.post('/polls',(req,res)=>{
  // 提交投票业务操作
  res.status(201).json(createPoll(req.body, req.userName));
});
router.post('/polls/:id/vote',(req,res)=>{
  // 提交投票业务操作
  res.json(vote(req.params.id, req.body, req.userName));
});
module.exports = router;
