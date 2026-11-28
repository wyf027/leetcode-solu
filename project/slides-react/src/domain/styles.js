const STYLE_CATEGORIES = {
  all: '全部',
  work: '工作汇报',
  business: '金融投资',
  consulting: '战略咨询',
  promotion: '宣传推广',
  academic: '学术研究',
};
function getStyleCategory(styleId) {
  const match = /^\d+_([a-z]+)_/.exec(String(styleId));
  if (match) {
    return match[1];
  }
  return 'other';
}
export { STYLE_CATEGORIES, getStyleCategory };
