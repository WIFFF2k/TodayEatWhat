// 在临时数据库中执行回归检查，结束后清理自己的临时目录
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-what-check-'));
let status = 1;
try {
  const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], { stdio:'inherit', env:{ ...process.env, DATA_DIR:directory }, cwd:path.resolve(__dirname,'..') });
  status = result.status === null ? 1 : result.status;
} finally { fs.rmSync(directory, { recursive:true, force:true }); }
process.exit(status);
