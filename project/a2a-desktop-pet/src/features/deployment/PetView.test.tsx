import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { startDragging } = vi.hoisted(() => ({
  startDragging: vi.fn().mockResolvedValue(undefined),
}));
const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockImplementation((...[command]: [string, unknown?]) => {
    if (command === "get_codex_quota") {
      return Promise.resolve({ state: "available", remainingPercent: 62 });
    }
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { PetView } from "./PetView";
import { idlePetAnimation, petAnimationByState } from "./presentation";
import type {
  DeploymentSnapshot,
  ProductionBuildTriggerOutcome,
  ServiceKind,
} from "./types";

const snapshot: DeploymentSnapshot = {
  dominantState: "failed",
  jenkinsConfigured: true,
  frontend: {
    service: "frontend",
    label: "A2A 前端",
    state: "deployed",
    detail: "前端已部署并通过健康检查",
    buildNumber: 128,
    updatedAt: "刚刚",
  },
  backend: {
    service: "backend",
    label: "A2A 后端",
    state: "failed",
    detail: "后端新版本部署失败，旧版本仍可用",
    buildNumber: 184,
    updatedAt: "刚刚",
  },
  productionFrontend: {
    label: "生产前端",
    state: "deployed",
    detail: "Jenkins 晋级成功；生产路由已确认",
    buildNumber: 10,
    updatedAt: "刚刚",
  },
  productionBackend: {
    label: "生产后端",
    state: "promotionSucceeded",
    detail: "Jenkins 晋级成功；生产后端无独立健康探针",
    buildNumber: 10,
    updatedAt: "刚刚",
  },
};

const triggerBuild = vi.fn().mockResolvedValue(undefined);
const triggerProductionBuild = vi
  .fn<(service: ServiceKind) => Promise<ProductionBuildTriggerOutcome>>()
  .mockResolvedValue("cancelled");

function renderPet(
  nextSnapshot = snapshot,
  onTriggerBuild = triggerBuild,
  onTriggerProductionBuild = triggerProductionBuild,
) {
  return render(
    <PetView
      onTriggerBuild={onTriggerBuild}
      onTriggerProductionBuild={onTriggerProductionBuild}
      snapshot={nextSnapshot}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  triggerBuild.mockResolvedValue(undefined);
  triggerProductionBuild.mockResolvedValue("cancelled");
  invoke.mockImplementation((...[command]: [string, unknown?]) => {
    if (command === "get_codex_quota") {
      return Promise.resolve({ state: "available", remainingPercent: 62 });
    }
    return Promise.resolve(undefined);
  });
  vi.useRealTimers();
});

describe("PetView", () => {
  it("renders the left frontend and right backend status dots as build triggers", () => {
    renderPet();

    expect(
      screen.getByRole("button", {
        name: "触发前端构建（当前已部署）",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "触发后端构建（当前部署失败）",
      }),
    ).toBeEnabled();
    expect(screen.queryByText("A2A 部署状态")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新部署状态" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "打开 Jenkins 设置" }),
    ).toBeNull();
  });

  it("routes a production dot once to the native-confirmed callback", async () => {
    renderPet();

    fireEvent.click(
      screen.getByRole("button", {
        name: "打开生产前端晋级确认（当前已部署，构建 #10）",
      }),
    );

    await waitFor(() =>
      expect(triggerProductionBuild).toHaveBeenCalledWith("frontend"),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows success only after the native-confirmed command submits", async () => {
    triggerProductionBuild.mockResolvedValue("submitted");
    renderPet();

    fireEvent.click(
      screen.getByRole("button", { name: /打开生产后端晋级确认/ }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "生产后端晋级已提交",
    );
  });

  it("disables every status trigger while native confirmation or submission is pending", async () => {
    let finishProductionRequest: (
      value: ProductionBuildTriggerOutcome,
    ) => void = () => undefined;
    triggerProductionBuild.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProductionRequest = resolve;
        }),
    );
    renderPet();

    fireEvent.click(
      screen.getByRole("button", { name: /打开生产前端晋级确认/ }),
    );

    expect(triggerProductionBuild).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", {
        name: "正在等待生产前端晋级确认或提交",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /暂不能触发前端构建/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /暂不能触发后端构建/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: /暂不能打开生产后端晋级确认/,
      }),
    ).toBeDisabled();

    await act(async () => {
      finishProductionRequest("cancelled");
      await Promise.resolve();
    });
  });

  it("does not call the guarded command for an active production promotion", () => {
    renderPet({
      ...snapshot,
      productionFrontend: {
        ...snapshot.productionFrontend,
        state: "deploying",
      },
    });

    const trigger = screen.getByRole("button", {
      name: "生产前端正在晋级，不能重复触发",
    });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(triggerProductionBuild).not.toHaveBeenCalled();
  });

  it("triggers the matching Jenkins build without moving the pet", async () => {
    renderPet();

    fireEvent.click(
      screen.getByRole("button", {
        name: "触发前端构建（当前已部署）",
      }),
    );

    expect(triggerBuild).toHaveBeenCalledOnce();
    expect(triggerBuild).toHaveBeenCalledWith("frontend");
    expect(
      screen.getByRole("button", { name: "拖动桌宠；单击刷新额度" }),
    ).not.toHaveAttribute("aria-pressed");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "前端构建已提交",
    );
  });

  it("blocks duplicate build triggers while one request is pending", async () => {
    let finishBuild: () => void = () => undefined;
    triggerBuild.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishBuild = resolve;
        }),
    );
    renderPet();

    const frontendTrigger = screen.getByRole("button", {
      name: "触发前端构建（当前已部署）",
    });
    fireEvent.click(frontendTrigger);
    fireEvent.click(frontendTrigger);

    expect(triggerBuild).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "正在提交前端构建" }),
    ).toBeDisabled();

    await act(async () => {
      finishBuild();
      await Promise.resolve();
    });
  });

  it("keeps a deploying service disabled", () => {
    renderPet({
      ...snapshot,
      frontend: { ...snapshot.frontend, state: "deploying" },
      dominantState: "deploying",
    });

    const frontendTrigger = screen.getByRole("button", {
      name: "前端正在部署，不能重复触发",
    });
    expect(frontendTrigger).toBeDisabled();
    fireEvent.click(frontendTrigger);
    expect(triggerBuild).not.toHaveBeenCalled();
  });

  it("shows a trigger failure and re-enables the status dot", async () => {
    triggerBuild.mockRejectedValueOnce(
      new Error("Jenkins 凭据无效或没有构建权限"),
    );
    renderPet();

    fireEvent.click(
      screen.getByRole("button", {
        name: "触发后端构建（当前部署失败）",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Jenkins 凭据无效或没有构建权限",
    );
    expect(
      screen.getByRole("button", {
        name: "触发后端构建（当前部署失败）",
      }),
    ).toBeEnabled();
  });

  it("starts native dragging on the first drag gesture without refreshing quota", async () => {
    renderPet();
    await screen.findByText("62%");
    invoke.mockClear();
    const petButton = screen.getByRole("button", {
      name: "拖动桌宠；单击刷新额度",
    });

    fireEvent.pointerDown(petButton, {
      button: 0,
      clientX: 16,
      clientY: 16,
      pointerId: 7,
    });
    fireEvent.pointerMove(petButton, {
      clientX: 24,
      clientY: 16,
      pointerId: 7,
    });
    fireEvent.click(petButton);

    expect(startDragging).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps sub-threshold short presses as quota refreshes", async () => {
    renderPet();
    await screen.findByText("62%");
    invoke.mockClear();
    const petButton = screen.getByRole("button", {
      name: "拖动桌宠；单击刷新额度",
    });

    fireEvent.pointerDown(petButton, {
      button: 0,
      clientX: 16,
      clientY: 16,
      pointerId: 8,
    });
    fireEvent.pointerMove(petButton, {
      clientX: 21,
      clientY: 16,
      pointerId: 8,
    });
    fireEvent.click(petButton);

    expect(startDragging).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_codex_quota", {
        forceRefresh: true,
      }),
    );
  });

  it("uses the success animation for three loops before switching to idle", () => {
    vi.useFakeTimers();
    const deployedSnapshot: DeploymentSnapshot = {
      ...snapshot,
      backend: { ...snapshot.backend, state: "deployed" },
      dominantState: "deployed",
    };
    renderPet(deployedSnapshot);

    expect(screen.getByRole("img", { name: /已部署/ })).toHaveAttribute(
      "src",
      petAnimationByState.deployed,
    );
    act(() => vi.advanceTimersByTime(8_999));
    expect(screen.getByRole("img", { name: /已部署/ })).toHaveAttribute(
      "src",
      petAnimationByState.deployed,
    );
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("img", { name: /已部署/ })).toHaveAttribute(
      "src",
      idlePetAnimation,
    );
  });

  it("shows the real-quota progress bar, percentage, and shortcuts by default", async () => {
    renderPet();
    await act(async () => {
      await Promise.resolve();
    });

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "62");
    expect(progressbar.firstElementChild).toHaveStyle({ width: "62%" });
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_codex_quota", {
      forceRefresh: false,
    });
    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(screen.getByRole("button", { name: "启动工具首页" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "启动 LiveTalking Demo" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "打开算法题库" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Codex 与 DeepSeek 切换暂不可用" }),
    ).toBeDisabled();
  });

  it("forces one quota refresh after a genuine pet click", async () => {
    renderPet();
    await screen.findByText("62%");
    invoke.mockClear();
    invoke.mockImplementation((...[command]: [string, unknown?]) => {
      if (command === "get_codex_quota") {
        return Promise.resolve({ state: "available", remainingPercent: 80 });
      }
      return Promise.resolve(undefined);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "拖动桌宠；单击刷新额度" }),
    );

    expect(await screen.findByText("80%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "80",
    );
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({
      width: "80%",
    });
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("get_codex_quota", {
      forceRefresh: true,
    });
  });

  it("does not start overlapping forced quota refreshes", async () => {
    type AvailableQuota = { state: "available"; remainingPercent: number };
    let finishRequest: (quota: AvailableQuota) => void = () => undefined;

    renderPet();
    await screen.findByText("62%");
    invoke.mockClear();
    invoke.mockImplementation((...[command]: [string, unknown?]) => {
      if (command === "get_codex_quota") {
        return new Promise<AvailableQuota>((resolve) => {
          finishRequest = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    const petButton = screen.getByRole("button", {
      name: "拖动桌宠；单击刷新额度",
    });
    fireEvent.click(petButton);
    fireEvent.click(petButton);

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("get_codex_quota", {
      forceRefresh: true,
    });

    await act(async () => {
      finishRequest({ state: "available", remainingPercent: 79 });
      await Promise.resolve();
    });
    expect(screen.getByText("79%")).toBeInTheDocument();
  });

  it("keeps the previous percentage when a forced refresh is unavailable", async () => {
    renderPet();
    await screen.findByText("62%");
    invoke.mockClear();
    invoke.mockResolvedValueOnce({ state: "unavailable" });

    fireEvent.click(
      screen.getByRole("button", { name: "拖动桌宠；单击刷新额度" }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.queryByText("--%")).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_codex_quota", {
      forceRefresh: true,
    });
  });

  it("shows an unavailable percentage placeholder without a numeric value", async () => {
    invoke.mockImplementation((...[command]: [string, unknown?]) => {
      if (command === "get_codex_quota") {
        return Promise.resolve({ state: "unavailable" });
      }
      return Promise.resolve(undefined);
    });
    renderPet();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
    expect(screen.getByText("--%")).toBeInTheDocument();
  });
});
