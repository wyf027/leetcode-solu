import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { AnimatedPet } from "./AnimatedPet";
import { PetHoverTools } from "./PetHoverTools";
import { statePresentation } from "./presentation";
import type {
  DeploymentSnapshot,
  HermesShortcut,
  ProductionBuildTriggerOutcome,
  ProductionDeploymentStatus,
  ServiceDeploymentStatus,
  ServiceKind,
} from "./types";
import { usePetDrag } from "./usePetDrag";
import { useCodexQuota } from "./useCodexQuota";

interface PetViewProps {
  snapshot: DeploymentSnapshot;
  onTriggerBuild: (service: ServiceKind) => Promise<void>;
  onTriggerProductionBuild: (
    service: ServiceKind,
  ) => Promise<ProductionBuildTriggerOutcome>;
}

interface BuildNotice {
  tone: "success" | "error";
  message: string;
}

const serviceCopy: Record<ServiceKind, string> = {
  frontend: "前端",
  backend: "后端",
};

const productionCopy: Record<ServiceKind, string> = {
  frontend: "生产前端",
  backend: "生产后端",
};

type BuildEnvironment = "test" | "production";

interface BuildTarget {
  environment: BuildEnvironment;
  service: ServiceKind;
}

function productionStatusLabel(
  service: ServiceKind,
  status: ProductionDeploymentStatus,
) {
  const build =
    status.buildNumber === null ? "" : `，构建 #${status.buildNumber}`;
  return `打开${productionCopy[service]}晋级确认（当前${statePresentation[status.state].label}${build}）`;
}

export function PetView({
  snapshot,
  onTriggerBuild,
  onTriggerProductionBuild,
}: PetViewProps) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [busyShortcut, setBusyShortcut] = useState<HermesShortcut | null>(null);
  const [busyTarget, setBusyTarget] = useState<BuildTarget | null>(null);
  const [buildNotice, setBuildNotice] = useState<BuildNotice | null>(null);
  const busyTargetRef = useRef<BuildTarget | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const { onClick: handleDragClick, ...petDrag } = usePetDrag();
  const { refresh: refreshQuota } = useCodexQuota(true);

  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    },
    [],
  );

  function handlePetClick(event: MouseEvent<HTMLButtonElement>) {
    handleDragClick(event);
    if (!event.defaultPrevented) {
      setControlsOpen((open) => !open);
      refreshQuota();
    }
  }

  function runShortcut(action: HermesShortcut) {
    setBusyShortcut(action);
    void invoke("run_hermes_shortcut", { action })
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => setBusyShortcut(null), 750);
      });
  }

  function scheduleNoticeClear() {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setBuildNotice(null);
      noticeTimerRef.current = null;
    }, 4_000);
  }

  function releaseBuildTrigger() {
    busyTargetRef.current = null;
    setBusyTarget(null);
    releaseTimerRef.current = null;
  }

  function statusFor(target: BuildTarget) {
    if (target.environment === "test") {
      return snapshot[target.service];
    }
    return target.service === "frontend"
      ? snapshot.productionFrontend
      : snapshot.productionBackend;
  }

  async function triggerBuild(target: BuildTarget) {
    const status = statusFor(target);
    if (busyTargetRef.current !== null || status.state === "deploying") {
      return;
    }

    busyTargetRef.current = target;
    setBusyTarget(target);
    setBuildNotice(null);

    try {
      if (target.environment === "test") {
        await onTriggerBuild(target.service);
      } else {
        const outcome = await onTriggerProductionBuild(target.service);
        if (outcome === "cancelled") {
          releaseBuildTrigger();
          return;
        }
      }
      setBuildNotice({
        tone: "success",
        message:
          target.environment === "test"
            ? `${serviceCopy[target.service]}构建已提交`
            : `${productionCopy[target.service]}晋级已提交`,
      });
      releaseTimerRef.current = window.setTimeout(releaseBuildTrigger, 3_000);
    } catch (triggerError) {
      releaseBuildTrigger();
      setBuildNotice({
        tone: "error",
        message:
          triggerError instanceof Error && triggerError.message.length > 0
            ? triggerError.message
            : target.environment === "test"
              ? `${serviceCopy[target.service]}构建触发失败`
              : `${productionCopy[target.service]}晋级触发失败`,
      });
    } finally {
      scheduleNoticeClear();
    }
  }

  function buildTriggerLabel(status: ServiceDeploymentStatus) {
    const label = serviceCopy[status.service];
    if (status.state === "deploying") {
      return `${label}正在部署，不能重复触发`;
    }
    if (
      busyTarget?.environment === "test" &&
      busyTarget.service === status.service
    ) {
      return `正在提交${label}构建`;
    }
    if (busyTarget !== null) {
      return `其他构建请求处理中，暂不能触发${label}构建`;
    }
    return `触发${label}构建（当前${statePresentation[status.state].label}）`;
  }

  function productionBuildTriggerLabel(
    service: ServiceKind,
    status: ProductionDeploymentStatus,
  ) {
    if (status.state === "deploying") {
      return `${productionCopy[service]}正在晋级，不能重复触发`;
    }
    if (
      busyTarget?.environment === "production" &&
      busyTarget.service === service
    ) {
      return `正在等待${productionCopy[service]}晋级确认或提交`;
    }
    if (busyTarget !== null) {
      return `其他构建请求处理中，暂不能打开${productionCopy[service]}晋级确认`;
    }
    return productionStatusLabel(service, status);
  }

  return (
    <main className="relative h-screen w-screen select-none overflow-hidden bg-transparent text-slate-100">
      <div className="absolute bottom-0 left-1/2 h-full w-full -translate-x-1/2">
        {controlsOpen ? (
          <PetHoverTools busy={busyShortcut} onRun={runShortcut} />
        ) : null}
        <button
          aria-label="拖动桌宠；单击展开或收起工具并刷新额度"
          aria-expanded={controlsOpen}
          className="group absolute inset-x-1 bottom-6 h-[138px] cursor-grab rounded-[38px] outline-none transition duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-cyan-300 active:cursor-grabbing"
          data-tauri-drag-region
          {...petDrag}
          onClick={handlePetClick}
          type="button"
        >
          <span className="absolute inset-0">
            <AnimatedPet
              key={snapshot.dominantState}
              state={snapshot.dominantState}
            />
          </span>
        </button>
        <div
          className={`${controlsOpen ? "" : "hidden "}pointer-events-none absolute inset-x-1 bottom-6 z-20 h-[138px]`}
        >
          <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center gap-0.5">
            <div
              aria-label="测试环境部署状态"
              className="relative flex"
              role="group"
            >
              <span
                aria-hidden="true"
                className="absolute -left-2.5 top-1 text-[7px] font-semibold text-cyan-100/70"
              >
                测
              </span>
              {[snapshot.frontend, snapshot.backend].map((status) => {
                const disabled =
                  busyTarget !== null || status.state === "deploying";
                const triggerLabel = buildTriggerLabel(status);

                return (
                  <button
                    aria-label={triggerLabel}
                    className="pointer-events-auto flex h-5 w-5 cursor-pointer items-center justify-center rounded-full outline-none transition hover:scale-125 focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:scale-100"
                    disabled={disabled}
                    key={status.service}
                    onClick={() =>
                      void triggerBuild({
                        environment: "test",
                        service: status.service,
                      })
                    }
                    title={triggerLabel}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full border border-white/55 shadow-[0_0_11px] ${statePresentation[status.state].light}`}
                    />
                  </button>
                );
              })}
            </div>
            <div
              aria-label="生产环境部署状态"
              className="relative flex"
              role="group"
            >
              <span
                aria-hidden="true"
                className="absolute -left-2.5 top-1 text-[7px] font-semibold text-amber-100/80"
              >
                产
              </span>
              {[
                {
                  service: "frontend" as const,
                  status: snapshot.productionFrontend,
                },
                {
                  service: "backend" as const,
                  status: snapshot.productionBackend,
                },
              ].map(({ service, status }) => {
                const triggerLabel = productionBuildTriggerLabel(
                  service,
                  status,
                );
                const disabled =
                  busyTarget !== null || status.state === "deploying";

                return (
                  <button
                    aria-label={triggerLabel}
                    className="pointer-events-auto flex h-5 w-5 cursor-pointer items-center justify-center rounded-full outline-none opacity-85 transition hover:scale-125 focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:scale-100"
                    disabled={disabled}
                    key={service}
                    onClick={() =>
                      void triggerBuild({
                        environment: "production",
                        service,
                      })
                    }
                    title={triggerLabel}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full border border-amber-100/70 shadow-[0_0_11px] ${statePresentation[status.state].light}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {buildNotice !== null ? (
          <p
            className={`absolute bottom-[162px] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] shadow-lg backdrop-blur-xl ${
              buildNotice.tone === "success"
                ? "border-emerald-300/30 bg-emerald-950/90 text-emerald-100"
                : "border-rose-300/30 bg-rose-950/90 text-rose-100"
            }`}
            role={buildNotice.tone === "error" ? "alert" : "status"}
          >
            {buildNotice.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
