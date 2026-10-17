# 飞机大战失败结果池

`routes.js` 提供独立失败结果池的读取、新增、启用、改名和软删除接口；`services/pool.js` 负责名称校验与并发检查；`repositories/pool.js` 负责 `game_failure_options` 表读写。该数据集合只服务飞机大战，不属于共享餐厅选项和“待定”分类。
