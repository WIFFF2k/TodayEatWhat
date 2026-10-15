// 统一数据库上海时间与用餐标题规则
function timestamp(value) {
  // 将数据库内的本地时间按部署约定转换为上海时间
  return Date.parse(value.replace(' ', 'T') + '+08:00');
}
function mealTitle() {
  // 按上海时间区分中午和晚上
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return (hour < 17 ? '中午' : '晚上') + '吃啥';
}
module.exports = { timestamp, mealTitle };
