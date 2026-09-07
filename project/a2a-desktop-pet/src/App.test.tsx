import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, startDragging } = vi.hoisted(() => ({
  invoke: vi.fn(),
  startDragging: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging }),
}));

import App from "./App";
import type { DeploymentSnapshot } from "./features/deployment/types";

const snapshot: DeploymentSnapshot = {
  dominantState: "deployed",
  jenkinsConfigured: true,
  frontend: {
    service: "frontend",
    label: "A2A 前端",
    state: "deployed",
    detail: "前端已部署",
    buildNumber: 8,
    updatedAt: "刚刚",
  },
  backend: {
    service: "backend",
    label: "A2A 后端",
    state: "deployed",
    detail: "后端已部署",
    buildNumber: 5,
    updatedAt: "刚刚",
  },
  productionFrontend: {
    label: "生产前端",
    state: "deployed",
    detail: "生产前端已部署",
    buildNumber: 10,
    updatedAt: "刚刚",
  },
  productionBackend: {
    label: "生产后端",
    state: "promotionSucceeded",
    detail: "生产后端晋级成功；无独立健康探针",
    buildNumber: 10,
    updatedAt: "刚刚",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockImplementation((command: string) => {
    if (command === "get_credential_status") {
      return Promise.resolve({ configured: true, username: "jenkins-user" });
    }
    if (command === "get_deployment_snapshot") {
      return Promise.resolve(snapshot);
    }
    if (command === "get_codex_quota") {
      return Promise.resolve({ state: "unavailable" });
    }
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("routes a frontend status-dot click to the fixed Tauri build command", async () => {
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "触发前端构建（当前已部署）",
      }),
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("trigger_jenkins_build", {
        service: "frontend",
      });
    });
  });

  it("routes production through the guarded Tauri command without refreshing on cancellation", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "trigger_production_jenkins_build") {
        return Promise.resolve("cancelled");
      }
      if (command === "get_credential_status") {
        return Promise.resolve({ configured: true, username: "jenkins-user" });
      }
      if (command === "get_deployment_snapshot")
        return Promise.resolve(snapshot);
      if (command === "get_codex_quota") {
        return Promise.resolve({ state: "unavailable" });
      }
      return Promise.resolve(undefined);
    });
    render(<App />);
    await screen.findByRole("button", { name: /打开生产前端晋级确认/ });
    const initialReads = invoke.mock.calls.filter(
      ([command]) => command === "get_deployment_snapshot",
    ).length;

    fireEvent.click(
      screen.getByRole("button", { name: /打开生产前端晋级确认/ }),
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("trigger_production_jenkins_build", {
        service: "frontend",
      });
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "get_deployment_snapshot",
      ),
    ).toHaveLength(initialReads);
  });

  it("refreshes deployment state after a submitted production promotion", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "trigger_production_jenkins_build") {
        return Promise.resolve("submitted");
      }
      if (command === "get_credential_status") {
        return Promise.resolve({ configured: true, username: "jenkins-user" });
      }
      if (command === "get_deployment_snapshot")
        return Promise.resolve(snapshot);
      if (command === "get_codex_quota") {
        return Promise.resolve({ state: "unavailable" });
      }
      return Promise.resolve(undefined);
    });
    render(<App />);
    await screen.findByRole("button", { name: /打开生产后端晋级确认/ });
    const initialReads = invoke.mock.calls.filter(
      ([command]) => command === "get_deployment_snapshot",
    ).length;

    fireEvent.click(
      screen.getByRole("button", { name: /打开生产后端晋级确认/ }),
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("trigger_production_jenkins_build", {
        service: "backend",
      });
    });
    await waitFor(() => {
      expect(
        invoke.mock.calls.filter(
          ([command]) => command === "get_deployment_snapshot",
        ),
      ).toHaveLength(initialReads + 1);
    });
  });

  it("uses the fast polling interval while a production promotion is running", async () => {
    vi.useFakeTimers();
    invoke.mockImplementation((command: string) => {
      if (command === "get_credential_status") {
        return Promise.resolve({ configured: true, username: "jenkins-user" });
      }
      if (command === "get_deployment_snapshot") {
        return Promise.resolve({
          ...snapshot,
          productionFrontend: {
            ...snapshot.productionFrontend,
            state: "deploying",
          },
        });
      }
      if (command === "get_codex_quota") {
        return Promise.resolve({ state: "unavailable" });
      }
      return Promise.resolve(undefined);
    });

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "get_deployment_snapshot",
      ),
    ).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "get_deployment_snapshot",
      ),
    ).toHaveLength(2);
  });
});
