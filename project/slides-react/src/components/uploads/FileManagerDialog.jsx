import { Modal } from '../common/Modal.jsx';
import { CheckCircle, X } from '@phosphor-icons/react';
import { FileRow } from './FileRow.jsx';
function FileManagerDialog({ files, usedCapacityMb, onRemove, onClose }) {
  return (
    <Modal titleId="file-manager-title" onClose={onClose} className="file-manager-modal">
      <header className="file-manager__header">
        <div>
          <h2 id="file-manager-title">管理参考资料</h2>
          <p>
            已上传 {files.length} / 20 个文件 · 已用 {usedCapacityMb} MB / 200 MB
          </p>
        </div>
        <button
          className="icon-button modal-close"
          type="button"
          onClick={onClose}
          aria-label="关闭文件管理"
        >
          <X size={24} />
        </button>
      </header>
      <div className="file-manager__body">
        <ul className="file-manager__list" aria-label="全部已选文件">
          {files.map((file) => (
            <FileRow key={file.id} file={file} onRemove={onRemove} />
          ))}
        </ul>
      </div>
      <footer className="file-manager__footer">
        <span>
          <CheckCircle size={17} weight="fill" />
          {files.length} 个文件均可单独查看和移除
        </span>
        <button className="primary-button" type="button" onClick={onClose}>
          完成
        </button>
      </footer>
    </Modal>
  );
}
export { FileManagerDialog };
