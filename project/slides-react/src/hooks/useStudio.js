import React from 'react';
import { DELIVERABLES, isDemo } from '../config.js';
import { getAvailableCredits, getConsumptionLabel, normalizeCredits } from '../domain/credits.js';
import {
  createJob,
  deleteUpload,
  getEntitlements,
  getSession,
  getStyles,
  getUploads,
  isUnauthorized,
  uploadFile,
} from '../services/index.js';
import { VISIBLE_FILE_COUNT, normalizeUploads } from '../domain/uploads.js';
import { createPagePolicy, getMaxPages, getPageSummary } from '../domain/pages.js';
export function useStudio() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [session, setSession] = React.useState(null);
  const [credits, setCredits] = React.useState([]);
  const [allStyles, setAllStyles] = React.useState([]);
  const [topic, setTopic] = React.useState('');
  const [notifyEmail, setNotifyEmail] = React.useState('');
  const [pageSelection, setPageSelection] = React.useState('adaptive');
  const [showLongPageDialog, setShowLongPageDialog] = React.useState(false);
  const [uploads, setUploads] = React.useState([]);
  const [uploadingCount, setUploadingCount] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [showFileManager, setShowFileManager] = React.useState(false);
  const [styleSource, setStyleSource] = React.useState(null);
  const [selectedStyle, setSelectedStyle] = React.useState(null);
  const [previousStyleSource, setPreviousStyleSource] = React.useState(null);
  const [showStylePicker, setShowStylePicker] = React.useState(false);
  const [showRedeemDialog, setShowRedeemDialog] = React.useState(false);
  const [confirmStage, setConfirmStage] = React.useState(null);
  const [createdJob, setCreatedJob] = React.useState(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const [activeJob, setActiveJob] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const [deliverable, setDeliverable] = React.useState('pptx');
  const [operation, setOperation] = React.useState('create');
  const [uploadProgress, setUploadProgress] = React.useState(null);
  React.useEffect(() => {
    if (!toast) {
      return;
    }
    const toastTimer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(toastTimer);
  }, [toast]);
  const refreshCredits = async () => {
    setCredits(normalizeCredits(await getEntitlements()));
  };
  const refreshUploads = async () => {
    const response = await getUploads();
    setUploads(normalizeUploads(response?.items));
  };
  React.useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const currentSession = await getSession();
        if (!isActive) {
          return;
        }
        setSession(currentSession);
        const [entitlements, styleResponse, uploadResponse] = await Promise.all([
          getEntitlements(),
          getStyles(),
          getUploads(),
        ]);
        if (!isActive) {
          return;
        }
        setCredits(normalizeCredits(entitlements));
        setAllStyles(styleResponse?.items ?? []);
        setUploads(normalizeUploads(uploadResponse?.items));
      } catch (error) {
        if (isActive && !isUnauthorized(error)) {
          setToast(error?.message || '连接后端失败，请刷新重试');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);
  const styles = React.useMemo(
    () => allStyles.filter((style) => style.id !== 'free_style'),
    [allStyles],
  );
  const freeStyle = React.useMemo(
    () => allStyles.find((style) => style.id === 'free_style'),
    [allStyles],
  );
  const styleLabel =
    styleSource === null
      ? '待选择'
      : styleSource === 'reference'
        ? '跟随参考文件'
        : styleSource === 'free'
          ? '自由风格'
          : (selectedStyle?.name ?? '待选择');
  const pageSummary = getPageSummary(pageSelection);
  const maxPages = getMaxPages(pageSelection);
  const availableCredits = getAvailableCredits(credits, maxPages);
  const consumptionLabel = getConsumptionLabel(credits, maxPages);
  const longPageAuthorized = getAvailableCredits(credits, 60) > 0;
  const styleHelp =
    styleSource === null
      ? '请选择一种视觉风格后继续。'
      : styleSource === 'reference'
        ? uploads.length > 0
          ? '已选择跟随参考文件，将使用上传文件作为视觉风格来源，无需再选平台精选风格。'
          : '请上传至少一个 PPT 模板/样板（.pptx 文件），AI 才能学习它的视觉风格；如果手里只有 Word 或图片，建议选「自由风格」。'
        : styleSource === 'free'
          ? '已选择自由风格，AI 会根据文件内容自由识别并搭配合适风格。'
          : selectedStyle
            ? `已选择平台精选风格“${selectedStyle.name}”，可直接开始生成。`
            : '请选择一款平台精选风格。';
  const handleFiles = async (fileList) => {
    const remainingSlots = Math.max(0, 20 - uploads.length);
    const filesToUpload = Array.from(fileList).slice(0, remainingSlots);
    if (filesToUpload.length === 0) {
      if (uploads.length >= 20) {
        setToast('最多只能上传 20 个文件');
      }
      return;
    }
    setUploadingCount((count) => count + filesToUpload.length);
    for (const file of filesToUpload) {
      try {
        setUploadProgress({
          name: file.name,
          percent: 0,
        });
        await uploadFile(file, {
          onProgress: (fraction) => {
            setUploadProgress({
              name: file.name,
              percent: Math.round(fraction * 100),
            });
          },
        });
      } catch (error) {
        setToast(error?.message || `${file.name} 上传失败`);
      } finally {
        setUploadingCount((count) => Math.max(0, count - 1));
        setUploadProgress(null);
      }
    }
    try {
      await refreshUploads();
    } catch {}
  };
  const onRemove = async (uploadId) => {
    const previousUploads = uploads;
    setUploads((currentUploads) => currentUploads.filter((file) => file.id !== uploadId));
    try {
      await deleteUpload(uploadId);
    } catch (error) {
      setUploads(previousUploads);
      setToast(error?.message || '删除失败，请重试');
    }
  };
  const usedCapacityMb = (
    uploads.reduce((acc, item) => acc + item.sizeBytes, 0) /
    1024 /
    1024
  ).toFixed(1);
  const visibleFiles = uploads.slice(0, VISIBLE_FILE_COUNT);
  const selectStyleSource = (source) => {
    setStyleSource(source);
    setShowStylePicker(false);
  };
  const openStylePicker = () => {
    setPreviousStyleSource(styleSource);
    setShowStylePicker(true);
  };
  const onCancel = () => {
    setStyleSource(previousStyleSource);
    setShowStylePicker(false);
  };
  const confirmStyle = (style) => {
    setSelectedStyle(style);
    setStyleSource('platform');
    setShowStylePicker(false);
    setToast(`已应用“${style.name}”风格`);
  };
  const resolveStyle = () => {
    if (styleSource === 'platform' && selectedStyle) {
      return {
        id: selectedStyle.id,
        version: selectedStyle.version ?? 1,
      };
    }
    return {
      id: 'free_style',
      version: freeStyle?.version ?? 1,
    };
  };
  const submitJob = async () => {
    setConfirmStage('loading');
    const style = resolveStyle();
    try {
      const job = await createJob({
        topic: topic.trim(),
        requirements:
          styleSource === 'reference'
            ? '请严格参考所上传文件的版式、配色与视觉风格进行复刻，保持与参考文件一致的视觉语言。'
            : '',
        style_id: style.id,
        style_version: style.version,
        page_policy: createPagePolicy(pageSelection),
        generation_mode: 'adaptive',
        upload_ids: uploads.filter((file) => file.usable).map((file) => file.id),
        notify_email: isDemo ? '' : notifyEmail.trim(),
        deliverable_kind: deliverable,
        presentation_operation: deliverable === 'pptx' ? operation : 'create',
      });
      setCreatedJob(job);
      setConfirmStage('success');
      await refreshCredits().catch(() => {});
    } catch (error) {
      setConfirmStage(null);
      setToast(error?.message || '下单失败，请稍后重试');
    }
  };
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(notifyEmail.trim());
  const emailInvalid = notifyEmail.trim().length > 0 && !emailValid;
  const canGenerate =
    topic.trim().length > 0 &&
    availableCredits > 0 &&
    styleSource !== null &&
    uploadingCount === 0 &&
    !emailInvalid &&
    (operation !== 'beautify' || uploads.some((file) => /\.pptx$/i.test(file.name))) &&
    (styleSource !== 'platform' || selectedStyle) &&
    (styleSource !== 'reference' || uploads.length > 0);
  const quotaError = pageSelection === '31-60' ? '长篇额度不足' : '额度不足';
  const generateLabel =
    topic.trim().length === 0
      ? '请填写演示主题与要求'
      : styleSource
        ? availableCredits <= 0
          ? quotaError
          : styleSource === 'reference' && uploads.length === 0
            ? '请先上传参考文件'
            : styleSource === 'platform' && !selectedStyle
              ? '请选择一款平台精选风格'
              : operation === 'beautify' && !uploads.some((file) => /\.pptx$/i.test(file.name))
                ? '请上传需要美化的 PPTX'
                : `${isDemo ? '演示：' : ''}${DELIVERABLES[deliverable].action}`
        : '请选择视觉风格';
  const generateHint = canGenerate
    ? '进入确认'
    : topic.trim().length === 0
      ? '填写后即可生成'
      : styleSource
        ? availableCredits <= 0
          ? '添加额度后即可生成'
          : styleSource === 'reference' && uploads.length === 0
            ? '上传后即可生成'
            : styleSource === 'platform' && !selectedStyle
              ? '选择后即可生成'
              : '完成后即可生成'
        : '三选一后即可生成';
  const onAuthorized = async () => {
    setIsLoading(true);
    try {
      const currentSession = await getSession();
      setSession(currentSession);
      const [entitlements, styleResponse, uploadResponse] = await Promise.all([
        getEntitlements(),
        getStyles(),
        getUploads(),
      ]);
      setCredits(normalizeCredits(entitlements));
      setAllStyles(styleResponse?.items ?? []);
      setUploads(normalizeUploads(uploadResponse?.items));
    } catch (error) {
      setToast(error?.message || '授权成功但数据加载失败，请刷新页面');
    } finally {
      setIsLoading(false);
    }
  };
  return {
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
  };
}
