const PAGE_OPTIONS = [
  {
    value: 'adaptive',
    label: '自动页数',
    summary: 'AI 智能决定',
    confirmation: '由 AI 根据内容自动决定页数',
    range: {
      min: 1,
      max: 12,
    },
  },
  {
    value: '1-5',
    label: '1–5 页',
    range: {
      min: 1,
      max: 5,
    },
  },
  {
    value: '6-10',
    label: '6–10 页',
    range: {
      min: 6,
      max: 10,
    },
  },
  {
    value: '11-15',
    label: '11–15 页',
    range: {
      min: 11,
      max: 15,
    },
  },
  {
    value: '16-20',
    label: '16–20 页',
    range: {
      min: 16,
      max: 20,
    },
  },
  {
    value: '21-25',
    label: '21–25 页',
    range: {
      min: 21,
      max: 25,
    },
  },
  {
    value: '26-30',
    label: '26–30 页',
    range: {
      min: 26,
      max: 30,
    },
  },
  {
    value: '31-60',
    label: '31–60 页',
    range: {
      min: 31,
      max: 60,
    },
    requiresAuthorization: true,
    authorizationLabel: '需授权',
  },
].map((option) => ({
  ...option,
  summary: option.summary ?? option.label,
  confirmation: option.confirmation ?? `创建 ${option.label} PPT`,
}));
function getPageOption(selection) {
  return PAGE_OPTIONS.find((option) => option.value === selection) ?? PAGE_OPTIONS[0];
}
function getPageSummary(selection) {
  const option = getPageOption(selection);
  return {
    selectionLabel: option.label,
    summary: option.summary,
    confirmation: option.confirmation,
  };
}
function getMaxPages(selection) {
  return getPageOption(selection).range.max;
}
function createPagePolicy(selection) {
  const { range } = getPageOption(selection);
  return {
    mode: 'range',
    min: range.min,
    max: range.max,
  };
}
export { PAGE_OPTIONS, getPageOption, getPageSummary, getMaxPages, createPagePolicy };
