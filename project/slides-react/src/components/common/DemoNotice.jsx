import { isDemo } from '../../config.js';
import { resetDemoState } from '../../demo/storage.js';
export function DemoNotice() {
  if (!isDemo) return null;
  return (
    <aside className="demo-notice" aria-label="演示模式说明">
      <span className="demo-badge">演示模式</span>
      <span>任务为本地模拟 · 不调用 AI · 下载 HTML 预览</span>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('重置当前浏览器的演示记录、文件列表与模拟额度？')) {
            resetDemoState();
            window.location.reload();
          }
        }}
      >
        重置演示
      </button>
    </aside>
  );
}
