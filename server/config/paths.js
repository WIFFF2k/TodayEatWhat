// 集中定位项目根目录，目录迁移不改变数据库和静态文件位置
const path = require('path');
const projectRoot = path.resolve(__dirname, '../..');
module.exports = { projectRoot, publicDir: path.join(projectRoot, 'public'), dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(projectRoot, 'data') };
