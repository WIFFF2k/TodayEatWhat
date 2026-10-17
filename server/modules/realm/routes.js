// 装配迩灵邑世界查询与玩家操作接口
const router = require('express').Router();
const service = require('./services/realm');
router.get('/realm/overview', (req, res) => res.json(service.overview(req.userName, req.query.q, req.query.r)));
router.post('/realm/tiles/claim', (req, res) => res.json(service.claim(req.userName, req.body.q, req.body.r)));
router.post('/realm/buildings', (req, res) => res.json(service.build(req.userName, req.body.q, req.body.r, req.body.building)));
router.post('/realm/buildings/upgrade', (req, res) => res.json(service.upgrade(req.userName, req.body.q, req.body.r)));
router.post('/realm/donate', (req, res) => res.json(service.donate(req.userName, req.body.recipient, req.body.amount)));
router.post('/realm/attack', (req, res) => res.json(service.attack(req.userName, req.body.q, req.body.r)));
router.post('/realm/breakthrough', (req, res) => res.json(service.breakthrough(req.userName)));
router.post('/realm/cultivate', (req, res) => res.json(service.cultivate(req.userName)));
router.post('/realm/destroy-world', (req, res) => res.json(service.destroyWorld(req.userName)));
module.exports = router;
