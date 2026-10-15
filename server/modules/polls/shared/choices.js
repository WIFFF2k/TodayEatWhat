// 定义投票固定的三个语义候选项
const CHOICES = [
  { code: 'go', name: '去' },
  { code: 'skip', name: '不去' },
  { code: 'redo', name: '我不服我要重转' }
];
const REDO_CODE = 'redo';

module.exports = { CHOICES, REDO_CODE };
