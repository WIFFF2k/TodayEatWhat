# 启动与局域网

根目录 server.js 先设置 TZ=Asia/Shanghai，再加载 start.js
start.js 校验 PORT、加载 Express 应用、绑定 0.0.0.0，并显示本机和各网卡地址
默认端口 20180，OPEN_BROWSER=1 时仅在 Windows 自动打开浏览器

instance.js 通过 /api/instance 核对 application 和项目绝对目录，区分本站、其他服务与无法确认
start.bat 启动前运行 replace.js：确认端口上是本项目就先结束旧进程，再用最新代码启动；端口空闲、属于其他服务或无法确认时不处理，由 start.js 报告原因
直接运行 node server.js 时重复启动仍然复用本站进程，不结束其他进程
EADDRINUSE 表示端口被占用，EACCES 表示端口权限或保留范围问题，启动窗口显示具体原因
修改服务端后重新运行 start.bat 即可，不需要手动结束旧进程；前端更新直接刷新
电脑休眠、关机或服务关闭后，其他设备无法继续访问
