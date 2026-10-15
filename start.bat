@echo off
setlocal
chcp 65001 >nul
title 今天吃啥（201版）
cd /d "%~dp0"

echo 正在检查 Node.js 环境...
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 24 或更高版本
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 版本过低，请安装 Node.js 24 或更高版本
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo 未找到 npm，请重新安装完整的 Node.js 环境
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试
    pause
    exit /b 1
  )
)

echo 正在启动今天吃啥...
set "OPEN_BROWSER=1"
node "server\runtime\replace.js"
call npm start
if errorlevel 1 (
  echo 网站启动失败，请查看上方错误信息
  pause
  exit /b 1
)
exit /b 0
