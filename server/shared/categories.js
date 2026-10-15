// 定义全站用餐分类的稳定标识和可调整显示名，修改 label 不需要迁移数据库
const categories = [
  { key: 'good_meal', label: '吃顿好的' },
  { key: 'casual_out', label: '出去随便吃点' },
  { key: 'takeout', label: '点外卖吧' },
  { key: 'pending', label: '待定' }
];
const categoryKeys = categories.map(item => item.key);
const legacyCategoryMap = {
  '吃顿好的': 'good_meal',
  '出去随便吃点': 'casual_out',
  '出去随便吃吧': 'casual_out',
  '出去随便吃': 'casual_out',
  '出去吃': 'casual_out',
  '点外卖吧': 'takeout',
  '点外卖': 'takeout',
  '外卖': 'takeout',
  '待定': 'pending'
};
function isCategoryKey(value) {
  // 判断分类 key 是否属于当前全站支持的范围
  return categoryKeys.includes(value);
}
function categoryLabel(key) {
  // 把分类 key 显示为当前全局配置的名称
  const item = categories.find(category => category.key === key);
  return item ? item.label : key;
}
module.exports = { categories, categoryKeys, legacyCategoryMap, isCategoryKey, categoryLabel };
