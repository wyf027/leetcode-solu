import { CheckCircle, FileDoc, FilePpt, X } from '@phosphor-icons/react';
function FileRow({ file, onRemove }) {
  const FileTypeIcon = file.kind === 'ppt' ? FilePpt : FileDoc;
  return (
    <li className="upload-file-row">
      <span className={`file-type file-type--${file.kind}`} aria-hidden="true">
        <FileTypeIcon weight="fill" size={26} />
      </span>
      <div className="file-copy">
        <strong>{file.name}</strong>
        <span>{file.size}</span>
      </div>
      <span className="upload-file-status">
        <CheckCircle size={16} weight="fill" />
        可用于生成
      </span>
      <button
        className="remove-file-button"
        type="button"
        aria-label={`移除 ${file.name}`}
        onClick={() => onRemove(file.id)}
      >
        <X size={16} />
        移除
      </button>
    </li>
  );
}
export { FileRow };
