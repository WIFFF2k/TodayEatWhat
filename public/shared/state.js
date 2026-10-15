// 保存当前浏览器会话状态，服务端数据仍以接口为准
export const state = { user: localStorage.getItem('eat-user') || '', page: '转盘', category: 'casual_out', categories: [], options: [], busy: false, dirty: false, serverOffset: 0, title: '', lastSpin: null, pollId: null, offset: 0 };
