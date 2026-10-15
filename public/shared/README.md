# 前端共享能力

state.js 是唯一浏览器会话状态；api.js 提供 api/post，统一身份编码和网络错误
interaction.js 提供 navigate、busy、toast、failure；display.js 提供文字转义、上海时间和标题展示

使用者直接导入需要的文件，避免创建重复的 state 对象
API 统一走 /api 相对路径，保持局域网设备使用同一服务
此目录不依赖 application 或 features，不保存服务端业务结果副本到本地存储
