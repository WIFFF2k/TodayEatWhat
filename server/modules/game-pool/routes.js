// 装配飞机大战独立失败结果池接口
const router = require('express').Router();
const service = require('./services/pool');
router.get('/game-failure-options', (req, res) => res.json(service.list()));
router.get('/game-failure-options/enabled', (req, res) => res.json(service.enabled()));
router.post('/game-failure-options', (req, res) => res.status(201).json({ options: service.create(req.body, req.userName) }));
router.patch('/game-failure-options/:id', (req, res) => res.json({ options: service.update(req.params.id, req.body, req.userName) }));
router.delete('/game-failure-options/:id', (req, res) => res.json({ options: service.remove(req.params.id, req.body) }));
module.exports = router;
