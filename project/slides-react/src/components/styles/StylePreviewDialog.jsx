import React from 'react';
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react';
function StylePreviewDialog({ style, onBack, onClose, onConfirm }) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const currentPage = style.pages[pageIndex] ?? style.pages[0];
  return (
    <>
      <header className="style-preview__header">
        <button className="style-preview__back" type="button" onClick={onBack}>
          <CaretLeft size={18} weight="bold" />
          返回风格库
        </button>
        <div>
          <h2 id="style-preview-title">{style.name}</h2>
          <p>
            {style.pages.length > 1
              ? `共 ${style.pages.length} 页真实版式预览`
              : '典藏风格仅保留封面预览'}
          </p>
        </div>
        <button
          className="icon-button modal-close"
          type="button"
          onClick={onClose}
          aria-label="关闭风格预览"
        >
          <X size={24} />
        </button>
      </header>
      <div className="style-preview__body">
        <div className="style-preview__stage">
          {currentPage && (
            <img
              src={currentPage.url}
              alt={currentPage.alt}
              width={currentPage.width}
              height={currentPage.height}
            />
          )}
          <button
            className="preview-nav preview-nav--previous"
            type="button"
            onClick={() => setPageIndex(pageIndex - 1)}
            disabled={pageIndex === 0}
            aria-label="上一页预览"
          >
            <CaretLeft size={22} weight="bold" />
          </button>
          <button
            className="preview-nav preview-nav--next"
            type="button"
            onClick={() => setPageIndex(pageIndex + 1)}
            disabled={pageIndex === style.pages.length - 1}
            aria-label="下一页预览"
          >
            <CaretRight size={22} weight="bold" />
          </button>
        </div>
        <div className="style-preview__pager">
          <strong>
            第 {pageIndex + 1} / {style.pages.length} 页
          </strong>
          <span>点击缩略图可快速查看整套版式</span>
        </div>
        <div className="style-preview__thumbs" aria-label={`${style.name}全部预览页`}>
          {style.pages.map((page, index) => (
            <button
              key={page.url}
              className={index === pageIndex ? 'is-active' : ''}
              type="button"
              onClick={() => setPageIndex(index)}
              aria-label={`查看第 ${index + 1} 页`}
              aria-pressed={index === pageIndex}
            >
              <img src={page.url} alt="" width={page.width} height={page.height} loading="lazy" />
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
      </div>
      <footer className="modal-footer style-preview__footer">
        <div className="modal-selection">
          <span>当前预览</span>
          <strong>
            {style.name} · {style.pages.length} 页
          </strong>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          继续浏览
        </button>
        <button
          className="primary-button modal-confirm"
          type="button"
          onClick={() => onConfirm(style)}
        >
          使用此风格
        </button>
      </footer>
    </>
  );
}
export { StylePreviewDialog };
