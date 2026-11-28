const mode = import.meta.env.VITE_API_MODE || 'demo';
if (!['demo', 'http'].includes(mode)) throw new Error('VITE_API_MODE must be demo or http');
export const API_MODE = mode;
export const isDemo = mode === 'demo';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export const DELIVERABLES = {
  pptx: { label: 'PPT 演示', shortLabel: 'PPT', action: '生成 PPT' },
  docx: { label: 'Word 文档', shortLabel: 'Word', action: '生成文档' },
  xlsx: { label: 'Excel 表格', shortLabel: 'Excel', action: '生成表格' },
};
