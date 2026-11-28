import React from 'react';
import { STYLE_CATEGORIES, getStyleCategory } from '../../domain/styles.js';
import { getStylePreview } from '../../services/index.js';
import { Modal } from '../common/Modal.jsx';
import { StylePreviewDialog } from './StylePreviewDialog.jsx';
import { Check, Eye, MagnifyingGlass, X } from '@phosphor-icons/react';
function StylePickerDialog({ styles, selectedStyle, onCancel, onConfirm }) {
  const [category, setCategory] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [previewStyle, setPreviewStyle] = React.useState(null);
  const [loadingStyleId, setLoadingStyleId] = React.useState('');
  const [error, setError] = React.useState('');
  const closeButtonRef = React.useRef(null);
  React.useEffect(() => closeButtonRef.current?.focus(), []);
  const filteredStyles = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return styles.filter((style) => {
      const matchesCategory = category === 'all' || getStyleCategory(style.id) === category;
      const matchesSearch = !query || style.name.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [styles, category, search]);
  const openPreview = async (style) => {
    setLoadingStyleId(style.id);
    setError('');
    try {
      const preview = await getStylePreview(style.id);
      setPreviewStyle({
        ...style,
        pages: preview?.pages ?? [],
      });
    } catch (error) {
      setError(error?.message || '预览加载失败，请稍后重试');
    } finally {
      setLoadingStyleId('');
    }
  };
  if (previewStyle) {
    return (
      <Modal
        titleId="style-preview-title"
        onClose={() => setPreviewStyle(null)}
        className="style-preview-modal"
      >
        <StylePreviewDialog
          style={previewStyle}
          onBack={() => setPreviewStyle(null)}
          onClose={onCancel}
          onConfirm={onConfirm}
        />
      </Modal>
    );
  }
  return (
    <Modal titleId="style-modal-title" onClose={onCancel} className="style-modal">
      <header className="style-modal__header">
        <div>
          <h2 id="style-modal-title">平台精选风格</h2>
          <p>
            共 {styles.length} 款具名预设，点击任一风格先查看完整多页预览
            {error && <span className="form-error">　{error}</span>}
          </p>
        </div>
        <button
          ref={closeButtonRef}
          className="icon-button modal-close"
          type="button"
          onClick={onCancel}
          aria-label="关闭风格选择"
        >
          <X size={24} />
        </button>
      </header>
      <div className="style-toolbar">
        <div className="category-tabs" role="tablist" aria-label="风格分类">
          {Object.entries(STYLE_CATEGORIES).map(([categoryId, label]) => (
            <button
              key={categoryId}
              className={category === categoryId ? 'is-active' : ''}
              type="button"
              role="tab"
              aria-selected={category === categoryId}
              onClick={() => setCategory(categoryId)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="style-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <span className="sr-only">搜索平台精选风格</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索风格"
          />
        </label>
      </div>
      <div className="style-grid" aria-live="polite">
        {filteredStyles.map((style) => {
          const isSelected = style.id === selectedStyle?.id;
          return (
            <button
              key={style.id}
              className={`style-card${isSelected ? ' is-selected' : ''}`}
              type="button"
              onClick={() => openPreview(style)}
              aria-label={`查看${style.name}完整预览`}
            >
              <span className="style-card__preview">
                <img src={style.preview?.url} alt={`${style.name}风格预览`} loading="lazy" />
                {isSelected && (
                  <span className="style-check">
                    <Check size={14} weight="bold" />
                  </span>
                )}
              </span>
              <strong>{style.name}</strong>
              <span className="style-card__action">
                <Eye size={14} />
                {loadingStyleId === style.id ? '正在加载预览…' : '查看完整预览'}
              </span>
            </button>
          );
        })}
        {filteredStyles.length === 0 && (
          <div className="style-empty">
            <MagnifyingGlass size={28} />
            <strong>没有找到这个风格</strong>
            <span>换个名称或查看其他分类</span>
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <div className="modal-selection">
          {selectedStyle ? (
            <>
              <span>当前已使用</span>
              <strong>{selectedStyle.name}</strong>
            </>
          ) : (
            <>
              <span>选择方式</span>
              <strong>先预览，再决定使用</strong>
            </>
          )}
        </div>
        <button className="primary-button modal-confirm" type="button" onClick={onCancel}>
          关闭
        </button>
      </footer>
    </Modal>
  );
}
export { StylePickerDialog };
