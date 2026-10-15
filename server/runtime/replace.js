// 启动前结束占用端口的本项目旧服务，保证每次都用最新代码启动
const { execFileSync } = require('child_process');
const { identify } = require('./instance');
const port = Number(process.env.PORT || 20180);

async function main() {
  // 只处理确认为本项目的实例，端口空闲、属于其他服务或无法确认时交给 server.js 报告
  const { status } = await identify(port);
  if (status !== 'self') return;
  const processIds = listeningProcessIds();
  if (!processIds.length) return;
  for (const processId of processIds) process.kill(processId);
  await waitUntilFree();
  console.log(`已结束本项目的旧服务（进程 ${processIds.join('、')}），正在用最新代码启动`);
}

function listeningProcessIds() {
  // 按端口查询正在监听的进程，兼容没有进程号字段的旧版本服务
  const command = `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`;
  const output = execFileSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
  return [...new Set(output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))];
}

async function waitUntilFree() {
  // 等待旧进程真正释放端口，避免紧接着启动时仍然占用
  for (let attempt = 0; attempt < 25; attempt++) {
    const { status } = await identify(port);
    if (status !== 'self') return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  console.error(`[PORT_BUSY] 端口 ${port} 在结束旧服务后仍被占用，请手动检查占用该端口的进程`);
}

main().catch((error) => {
  // 结束失败时说明原因，端口真实状态仍由 server.js 报告
  console.error(`[REPLACE_FAILED] 结束本项目的旧服务失败：${error.message}`);
});
