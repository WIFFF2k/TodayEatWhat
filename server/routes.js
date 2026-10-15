// 按领域装配公开入口与身份验证后的业务接口
const router = require('express').Router();
router.use(require('./modules/identity/routes'));
router.use(require('./middleware/identity'));
router.use(require('./modules/options/routes'));
router.use(require('./modules/wheel/routes'));
router.use(require('./modules/settings/routes'));
router.use(require('./modules/polls/routes'));
router.use(require('./modules/records/routes'));
module.exports = router;
