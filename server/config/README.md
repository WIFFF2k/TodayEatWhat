# 路径配置

paths.js 以文件位置定位项目根目录，导出 projectRoot、publicDir、dataDir
默认数据库和静态目录不受 server 子目录深度影响
DATA_DIR 自定义相对路径由启动工作目录解析，需在根目录执行 npm start
