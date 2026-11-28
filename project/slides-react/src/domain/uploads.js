function formatFileSize(size_bytes) {
  const bytes = Number(size_bytes) || 0;
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function getFileKind(filename) {
  const normalizedName = String(filename).toLowerCase();
  if (normalizedName.endsWith('.ppt') || normalizedName.endsWith('.pptx')) {
    return 'ppt';
  }
  return 'doc';
}
const VISIBLE_FILE_COUNT = 2;
function normalizeUploads(uploads) {
  return (Array.isArray(uploads) ? uploads : [])
    .filter((upload) => upload.status !== 'deleted')
    .map((upload) => ({
      id: upload.upload_id,
      name: upload.filename,
      size: formatFileSize(upload.size_bytes),
      sizeBytes: Number(upload.size_bytes) || 0,
      kind: getFileKind(upload.filename),
      usable: upload.usable_for_generation !== false,
      warnings: upload.warnings ?? [],
    }));
}
export { formatFileSize, getFileKind, VISIBLE_FILE_COUNT, normalizeUploads };
