import { useStudio } from './hooks/useStudio.js';
import { DELIVERABLES, isDemo } from './config.js';
import { getAvailableCredits, normalizeCredits } from './domain/credits.js';
import { getEntitlements } from './services/index.js';
import { VISIBLE_FILE_COUNT } from './domain/uploads.js';
import { Wallet } from './components/credits/Wallet.jsx';
import { PagePolicySelect } from './components/creator/PagePolicySelect.jsx';
import { StyleSourceCard } from './components/styles/StyleSourceCard.jsx';
import {
  ArrowRight,
  CaretRight,
  CheckCircle,
  File,
  Files,
  ImageSquare,
  Lightning,
  LockKey,
  MagicWand,
  SquaresFour,
  UploadSimple,
} from '@phosphor-icons/react';
import { FileRow } from './components/uploads/FileRow.jsx';
import { SummaryItem } from './components/common/SummaryItem.jsx';
import { StylePickerDialog } from './components/styles/StylePickerDialog.jsx';
import { FileManagerDialog } from './components/uploads/FileManagerDialog.jsx';
import { RedeemDialog } from './components/credits/RedeemDialog.jsx';
import { LongPageDialog } from './components/credits/LongPageDialog.jsx';
import { ConfirmDialog } from './components/jobs/ConfirmDialog.jsx';
import { JobHistoryDialog } from './components/jobs/JobHistoryDialog.jsx';
import { JobProgressDialog } from './components/jobs/JobProgressDialog.jsx';
import { AccessGate } from './components/auth/AccessGate.jsx';
function App() {
  const {
    activeJob,
    canGenerate,
    confirmStage,
    confirmStyle,
    consumptionLabel,
    createdJob,
    credits,
    deliverable,
    emailInvalid,
    emailValid,
    generateHint,
    generateLabel,
    handleFiles,
    isDragging,
    isLoading,
    longPageAuthorized,
    notifyEmail,
    onAuthorized,
    onCancel,
    onRemove,
    openStylePicker,
    operation,
    pageSelection,
    pageSummary,
    refreshCredits,
    selectStyleSource,
    selectedStyle,
    session,
    setActiveJob,
    setConfirmStage,
    setCredits,
    setDeliverable,
    setIsDragging,
    setNotifyEmail,
    setOperation,
    setPageSelection,
    setShowFileManager,
    setShowHistory,
    setShowLongPageDialog,
    setShowRedeemDialog,
    setToast,
    setTopic,
    showFileManager,
    showHistory,
    showLongPageDialog,
    showRedeemDialog,
    showStylePicker,
    styleHelp,
    styleLabel,
    styleSource,
    styles,
    submitJob,
    toast,
    topic,
    uploadProgress,
    uploadingCount,
    uploads,
    usedCapacityMb,
    visibleFiles,
  } = useStudio();
  if (isLoading) {
    return (
      <div className="app-shell app-shell--booting" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        <p>正在加载创作台…</p>
      </div>
    );
  }
  if (session) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="#creator" aria-label="Kimi AI PPT 首页">
            <img src="/assets/k-brand.png" alt="" />
            <strong>Kimi AI PPT</strong>
            <span className="brand-tagline">{isDemo ? 'React 独立演示' : 'AI 创作台'}</span>
          </a>
          <div className="topbar__actions">
            <Wallet wallet={credits} />
            <button
              className="quota-button"
              type="button"
              onClick={() => setShowRedeemDialog(true)}
            >
              添加额度
            </button>
            <button className="history-button" type="button" onClick={() => setShowHistory(true)}>
              任务历史
            </button>
          </div>
        </header>
        <main id="creator" className="workspace-grid">
          <section className="creator-column" aria-labelledby="creator-title">
            <div className="intro">
              <h1 id="creator-title">想做一份怎样的{DELIVERABLES[deliverable].shortLabel}？</h1>
              <p>
                {isDemo
                  ? '从一个想法开始，体验从主题到成品预览的完整流程'
                  : '告知主题、上传资料，开始你的内容创作'}
              </p>
            </div>
            <div className="deliverable-controls">
              <div className="deliverable-tabs" aria-label="产出格式">
                {Object.entries(DELIVERABLES).map(([key, item]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={deliverable === key}
                    onClick={() => {
                      setDeliverable(key);
                      if (key !== 'pptx') setOperation('create');
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {deliverable === 'pptx' && (
                <div className="operation-tabs" aria-label="演示操作">
                  <button
                    type="button"
                    aria-pressed={operation === 'create'}
                    onClick={() => setOperation('create')}
                  >
                    新建演示
                  </button>
                  <button
                    type="button"
                    aria-pressed={operation === 'beautify'}
                    onClick={() => setOperation('beautify')}
                  >
                    美化已有 PPT
                  </button>
                </div>
              )}
            </div>
            <section className="form-section topic-section">
              <div className="section-heading topic-heading">
                <h2>演示主题与要求</h2>
                {deliverable === 'pptx' && (
                  <PagePolicySelect
                    value={pageSelection}
                    onChange={setPageSelection}
                    longPageAuthorized={longPageAuthorized}
                    onRequestAuthorization={() => setShowLongPageDialog(true)}
                  />
                )}
              </div>
              <div className={`topic-input${topic.length > 9500 ? ' is-warning' : ''}`}>
                <textarea
                  value={topic}
                  rows={6}
                  maxLength={10000}
                  placeholder="请在这里输入主题、内容重点和具体要求，例如：新能源汽车市场分析，重点说明行业趋势、用户画像和增长机会"
                  onChange={(event) => setTopic(event.target.value)}
                  aria-label="演示主题与要求"
                />
                <span>{topic.length} / 10000</span>
              </div>
            </section>
            <section className="form-section style-section">
              <div className="section-heading">
                <h2>
                  视觉风格 <span className="required-label">必选 · 三选一</span>
                </h2>
                <p>三选一，只决定成品长什么样；内容都来自你的主题和上传的文件。</p>
              </div>
              <div className="source-grid">
                <StyleSourceCard
                  active={styleSource === 'reference'}
                  title="跟随参考文件"
                  description="手里有模板或样板 PPT 时选，复刻它的配色、Logo 与排版（需上传 .pptx）"
                  icon={<File size={25} />}
                  actionLabel="选择跟随参考"
                  activeActionLabel="当前：跟随参考文件"
                  tone="blue"
                  onClick={() => selectStyleSource('reference')}
                />
                <StyleSourceCard
                  active={styleSource === 'free'}
                  title="自由风格"
                  description="让 AI 读懂你的内容，量身设计配色与排版"
                  icon={<MagicWand size={25} />}
                  actionLabel="选择自由风格"
                  activeActionLabel="当前：自由风格"
                  tone="violet"
                  onClick={() => selectStyleSource('free')}
                />
                <StyleSourceCard
                  active={styleSource === 'platform'}
                  title="平台精选风格"
                  meta={selectedStyle?.name ?? `${styles.length} 款`}
                  description={
                    selectedStyle
                      ? '已选定具名风格，点击可重新选择'
                      : `从 ${styles.length} 款平台精选风格里挑，可先逐页预览`
                  }
                  icon={<SquaresFour size={25} weight="fill" />}
                  actionLabel={`浏览 ${styles.length} 款平台精选风格`}
                  activeActionLabel={
                    selectedStyle ? `当前：${selectedStyle.name}` : '当前：平台精选风格'
                  }
                  tone="indigo"
                  onClick={openStylePicker}
                />
              </div>
              <div
                className={`selection-message${styleSource === null ? ' is-unselected' : styleSource === 'platform' && !selectedStyle ? ' is-pending' : ''}`}
              >
                {styleSource === null || (styleSource === 'platform' && !selectedStyle) ? (
                  <Lightning size={20} />
                ) : (
                  <CheckCircle size={20} weight="fill" />
                )}
                <span>{styleHelp}</span>
                {styleSource === 'platform' && selectedStyle && (
                  <button type="button" onClick={openStylePicker}>
                    更换风格
                  </button>
                )}
              </div>
            </section>
            <section className="form-section files-section">
              <div className="upload-heading">
                <h2>参考资料（可选）</h2>
                <span className={uploadingCount > 0 ? 'upload-counting' : undefined}>
                  {uploadingCount > 0
                    ? [`正在上传 ${uploadingCount} 个文件…`]
                    : [uploads.length, ' / 20']}
                </span>
              </div>
              <label
                className={`upload-dropzone${isDragging ? ' is-dragging' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  handleFiles(event.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  multiple
                  aria-label="选择资料"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.md,.csv"
                  onChange={(event) => {
                    handleFiles(event.target.files ?? []);
                    event.target.value = '';
                  }}
                />
                <span className="upload-dropzone__action">
                  <UploadSimple size={22} weight="bold" />
                  上传参考资料
                </span>
                <strong>点击选择，或直接拖入文件</strong>
                <span>支持 PDF / Word / Excel / PPT / 图片 / TXT / Markdown / CSV</span>
                <span>最多 20 个；单个不超过 100 MB，合计不超过 200 MB</span>
                <span className="upload-usage">已用 {usedCapacityMb} MB / 200 MB</span>
                <small>
                  {isDemo
                    ? '仅记录文件名和大小，不读取或上传文件内容'
                    : '文件将交给配置的服务端处理'}
                </small>
              </label>
              {uploadProgress && (
                <div className="upload-progress" role="status">
                  {uploadProgress.name} · {uploadProgress.percent}%
                  <progress max="100" value={uploadProgress.percent} />
                </div>
              )}
              {uploads.length > 0 && (
                <div className="file-summary-panel">
                  <ul className="file-summary-list" aria-label="最近上传的文件">
                    {visibleFiles.map((file) => (
                      <FileRow key={file.id} file={file} onRemove={onRemove} />
                    ))}
                  </ul>
                  <div className="file-summary-panel__footer">
                    <span>
                      {uploads.length > VISIBLE_FILE_COUNT
                        ? `另有 ${uploads.length - VISIBLE_FILE_COUNT} 个文件已收起，避免撑长页面`
                        : '可在文件管理中继续查看或移除'}
                    </span>
                    <button type="button" onClick={() => setShowFileManager(true)}>
                      管理全部 {uploads.length} 个文件
                      <CaretRight size={16} weight="bold" />
                    </button>
                  </div>
                </div>
              )}
            </section>
            <section className="form-section notify-section">
              <div className="upload-heading">
                <h2>{isDemo ? '通知邮箱（演示模式不发送）' : '做好了发我邮箱（可选）'}</h2>
                <span>{emailValid ? '已填写' : ''}</span>
              </div>
              <input
                className={`notify-input${emailInvalid ? ' is-invalid' : ''}`}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={notifyEmail}
                disabled={isDemo}
                maxLength={254}
                onChange={(event) => setNotifyEmail(event.target.value)}
                aria-label="接收成品的邮箱"
                aria-invalid={emailInvalid}
              />
              <p className={`notify-help${emailInvalid ? ' is-invalid' : ''}`}>
                {emailInvalid
                  ? '这个邮箱看着不太对，检查一下有没有漏掉 @ 或后缀'
                  : isDemo
                    ? '演示任务约 12 秒完成。可从任务历史下载 HTML 预览，不会发送邮件。'
                    : '填写邮箱后，由服务端在任务结束时发送通知。'}
              </p>
            </section>
          </section>
          <aside className="summary-card" aria-labelledby="summary-title">
            <h2 id="summary-title">生成概要</h2>
            <div className="summary-list">
              <SummaryItem
                icon={<Files size={24} />}
                title="内容资料"
                value={`${uploads.length} 个文件`}
              />
              <SummaryItem icon={<ImageSquare size={24} />} title="视觉风格" value={styleLabel} />
              <SummaryItem
                icon={<File size={24} />}
                title={deliverable === 'pptx' ? '预计页数' : '产出格式'}
                value={
                  deliverable === 'pptx' ? pageSummary.summary : DELIVERABLES[deliverable].label
                }
              />
              <SummaryItem
                icon={<Lightning size={24} weight="fill" />}
                title={isDemo ? '模拟消耗' : '本次消耗'}
                value={consumptionLabel}
              />
            </div>
            <button
              className="generate-button"
              type="button"
              disabled={!canGenerate}
              onClick={() => setConfirmStage('confirm')}
            >
              <span className="generate-button__copy">
                <strong>{generateLabel}</strong>
                <small>{generateHint}</small>
              </span>
              <ArrowRight size={23} aria-hidden="true" />
            </button>
            <div className="security-note">
              <LockKey size={18} weight="fill" />
              {isDemo ? '本地演示 · 无真实扣费' : '使用授权会话生成内容'}
            </div>
          </aside>
        </main>
        {showStylePicker && (
          <StylePickerDialog
            styles={styles}
            selectedStyle={selectedStyle}
            onCancel={onCancel}
            onConfirm={confirmStyle}
          />
        )}
        {showFileManager && (
          <FileManagerDialog
            files={uploads}
            usedCapacityMb={usedCapacityMb}
            onRemove={onRemove}
            onClose={() => setShowFileManager(false)}
          />
        )}
        {showRedeemDialog && (
          <RedeemDialog
            onClose={() => setShowRedeemDialog(false)}
            onAdded={async () => {
              await refreshCredits();
              setShowRedeemDialog(false);
              setToast('授权成功，额度已到账');
            }}
          />
        )}
        {showLongPageDialog && (
          <LongPageDialog
            onClose={() => setShowLongPageDialog(false)}
            onAuthorized={async () => {
              const updatedCredits = normalizeCredits(await getEntitlements());
              setCredits(updatedCredits);
              setShowLongPageDialog(false);
              if (getAvailableCredits(updatedCredits, 60) > 0) {
                setPageSelection('31-60');
                setToast('授权成功，已切换到 31–60 页');
              } else {
                setToast('额度已到账，但这张码不含长篇额度');
              }
            }}
          />
        )}
        {confirmStage && (
          <ConfirmDialog
            stage={confirmStage}
            sourceLabel={styleLabel}
            pageConfirmation={pageSummary.confirmation}
            consumptionCopy={consumptionLabel}
            fileCount={uploads.length}
            deliverableLabel={DELIVERABLES[deliverable].shortLabel}
            onClose={() => setConfirmStage(null)}
            onConfirm={submitJob}
            onViewProgress={() => {
              setConfirmStage(null);
              setActiveJob(createdJob);
            }}
          />
        )}
        {showHistory && (
          <JobHistoryDialog
            onClose={() => setShowHistory(false)}
            onOpenJob={(job) => {
              setShowHistory(false);
              setActiveJob(job);
            }}
          />
        )}
        {activeJob && (
          <JobProgressDialog
            job={activeJob}
            onClose={() => setActiveJob(null)}
            onChanged={() => {
              refreshCredits().catch(() => {});
            }}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <CheckCircle size={19} weight="fill" />
            {toast}
          </div>
        )}
      </div>
    );
  }
  return <AccessGate onAuthorized={onAuthorized} />;
}
export { App };
