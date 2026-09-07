import type { HermesShortcut } from "./types";

type Shortcut = {
  action: HermesShortcut;
  icon: string;
  label: string;
  disabled?: boolean;
};

const shortcuts: Shortcut[] = [
  { action: "toolsHome", icon: "⌂", label: "启动工具首页" },
  { action: "liveTalking", icon: "◉", label: "启动 LiveTalking Demo" },
  { action: "problemLibrary", icon: "↗", label: "打开算法题库" },
  { action: "codexIndex", icon: "▦", label: "启动 Codex 索引" },
  {
    action: "providerToggle",
    icon: "⇄",
    label: "Codex 与 DeepSeek 切换暂不可用",
    disabled: true,
  },
];

export function PetHoverTools({
  busy,
  onRun,
}: {
  busy: HermesShortcut | null;
  onRun: (action: HermesShortcut) => void;
}) {
  return (
    <section
      aria-label="Hermes 工具"
      className="absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 gap-1"
    >
      {shortcuts.map((shortcut) => (
        <button
          aria-label={shortcut.label}
          className="group relative flex h-6 w-6 items-center justify-center rounded-md text-xs text-cyan-100 transition hover:bg-cyan-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-35"
          disabled={shortcut.disabled || busy !== null}
          key={shortcut.action}
          onClick={() => onRun(shortcut.action)}
          type="button"
        >
          <span
            aria-hidden="true"
            className="[text-shadow:1px_0_0_#0f172a,-1px_0_0_#0f172a,0_1px_0_#0f172a,0_-1px_0_#0f172a]"
          >
            {busy === shortcut.action ? "·" : shortcut.icon}
          </span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-max max-w-[128px] -translate-x-1/2 rounded-md bg-slate-950 px-1.5 py-1 text-center text-[9px] leading-tight text-slate-200 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {shortcut.label}
          </span>
        </button>
      ))}
    </section>
  );
}
