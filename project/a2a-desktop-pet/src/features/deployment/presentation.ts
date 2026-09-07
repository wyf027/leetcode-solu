import type { DeploymentState, ProductionDeploymentState } from "./types";

export const statePresentation: Record<
  DeploymentState | ProductionDeploymentState,
  { label: string; light: string; text: string }
> = {
  deployed: {
    label: "已部署",
    light: "bg-emerald-400 shadow-emerald-400/90",
    text: "text-emerald-300",
  },
  deploying: {
    label: "部署中",
    light: "animate-pulse bg-sky-400 shadow-sky-400/90",
    text: "text-sky-300",
  },
  failed: {
    label: "部署失败",
    light: "bg-rose-400 shadow-rose-400/90",
    text: "text-rose-300",
  },
  promotionSucceeded: {
    label: "晋级成功，服务未验证",
    light: "bg-amber-400 shadow-amber-400/90",
    text: "text-amber-300",
  },
  unknown: {
    label: "状态未知",
    light: "bg-slate-400 shadow-slate-400/70",
    text: "text-slate-300",
  },
};

export const petAnimationByState: Record<DeploymentState, string> = {
  deployed: "/pet/deployed.gif",
  deploying: "/pet/deploying.gif",
  failed: "/pet/failed.gif",
  unknown: "/pet/unknown.gif",
};

export const idlePetAnimation = "/pet/idle.gif";
