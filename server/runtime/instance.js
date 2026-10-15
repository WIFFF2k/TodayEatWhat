// 核对端口上的服务是否属于当前项目
const { projectRoot } = require('../config/paths');

async function identify(port) {
  // 通过实例标识接口区分本站、其他服务和无法确认
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/instance`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { status: 'unknown', reason: `服务标识接口返回 ${response.status}` };
    const instance = await response.json();
    if (instance.application !== 'today-eat-what' || instance.directory !== projectRoot) {
      return { status: 'other', reason: '占用端口的服务不是当前项目' };
    }
    return { status: 'self', instance };
  } catch (error) {
    return { status: 'unknown', reason: error.message };
  }
}

module.exports = { identify };
