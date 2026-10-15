# 启动与局域网

根目录 server.js 先设置 TZ=Asia/Shanghai，再加载 start.js
start.js 校验 PORT、加载 Express 应用、绑定 0.0.0.0，并显示本机和各网卡地址
默认端口 20180，OPEN_BROWSER=1 时仅在 Windows 自动打开浏览器

重复启动通过 /api/instance 核对 application 和项目绝对目录，只复用本站，不结束其他进程
EADDRINUSE 表示端口被占用，EACCES 表示端口权限或保留范围问题，启动窗口显示具体原因
修改服务端后先 Ctrl+C 停止旧进程再运行 start.bat；前端更新直接刷新
电脑休眠、关机或服务关闭后，其他设备无法继续访问
