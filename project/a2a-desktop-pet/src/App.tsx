import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { PetView } from "./features/deployment/PetView";
import { SettingsView } from "./features/deployment/SettingsView";
import type {
  CredentialStatus,
  DeploymentSnapshot,
  ProductionBuildTriggerOutcome,
  ServiceKind,
} from "./features/deployment/types";

const EMPTY_CREDENTIAL_STATUS: CredentialStatus = {
  configured: false,
  username: null,
};

function App() {
  const [snapshot, setSnapshot] = useState<DeploymentSnapshot | null>(null);
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>(
    EMPTY_CREDENTIAL_STATUS,
  );
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await invoke<DeploymentSnapshot>(
        "get_deployment_snapshot",
      );
      setSnapshot(nextSnapshot);
      setCredentialStatus((current) => ({
        ...current,
        configured: nextSnapshot.jenkinsConfigured,
      }));
      setError(null);
    } catch {
      setError("无法读取 server20 部署状态");
    }
  }, []);

  const loadCredentialStatus = useCallback(async () => {
    try {
      const status = await invoke<CredentialStatus>("get_credential_status");
      setCredentialStatus(status);
      if (!status.configured) {
        setSettingsOpen(true);
      }
    } catch {
      setCredentialStatus(EMPTY_CREDENTIAL_STATUS);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCredentialStatus().then(refresh);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCredentialStatus, refresh]);

  useEffect(() => {
    if (snapshot === null || settingsOpen) {
      return undefined;
    }

    const pollDelay =
      snapshot.frontend.state === "deploying" ||
      snapshot.backend.state === "deploying" ||
      snapshot.productionFrontend.state === "deploying" ||
      snapshot.productionBackend.state === "deploying"
        ? 5_000
        : 30_000;
    const timer = window.setTimeout(() => void refresh(), pollDelay);
    return () => window.clearTimeout(timer);
  }, [refresh, settingsOpen, snapshot]);

  useEffect(() => {
    void invoke("set_pet_expanded", { expanded: settingsOpen }).catch(
      () => undefined,
    );
  }, [settingsOpen]);

  async function saveCredentials(username: string, token: string) {
    try {
      const status = await invoke<CredentialStatus>(
        "save_jenkins_credentials",
        { username, token },
      );
      setCredentialStatus(status);
      setSettingsOpen(false);
      await refresh();
    } catch (saveError) {
      throw new Error(
        typeof saveError === "string" ? saveError : "无法保存 Jenkins 凭据",
        { cause: saveError },
      );
    }
  }

  async function clearCredentials() {
    try {
      const status = await invoke<CredentialStatus>(
        "clear_jenkins_credentials",
      );
      setCredentialStatus(status);
      await refresh();
    } catch (clearError) {
      throw new Error(
        typeof clearError === "string" ? clearError : "无法删除 Jenkins 凭据",
        { cause: clearError },
      );
    }
  }

  const triggerBuild = useCallback(
    async (service: ServiceKind) => {
      try {
        await invoke("trigger_jenkins_build", { service });
        await refresh();
      } catch (triggerError) {
        throw new Error(
          typeof triggerError === "string"
            ? triggerError
            : "无法触发 Jenkins 构建",
          { cause: triggerError },
        );
      }
    },
    [refresh],
  );

  const triggerProductionBuild = useCallback(
    async (service: ServiceKind): Promise<ProductionBuildTriggerOutcome> => {
      try {
        const outcome = await invoke<ProductionBuildTriggerOutcome>(
          "trigger_production_jenkins_build",
          { service },
        );
        if (outcome === "submitted") {
          await refresh();
        }
        return outcome;
      } catch (triggerError) {
        throw new Error(
          typeof triggerError === "string" ? triggerError : "无法提交生产晋级",
          { cause: triggerError },
        );
      }
    },
    [refresh],
  );

  if (settingsOpen) {
    return (
      <SettingsView
        credentialStatus={credentialStatus}
        onClear={clearCredentials}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onSave={saveCredentials}
      />
    );
  }

  if (error !== null && snapshot === null) {
    return (
      <main className="relative flex h-screen w-screen items-end justify-center overflow-hidden bg-transparent pb-3 text-center">
        <img
          alt="星际水滴精灵：连接失败"
          className="h-40 w-40 object-contain opacity-75"
          draggable={false}
          src="/pet/unknown-fallback.png"
        />
        <p className="absolute bottom-2 rounded-full border border-rose-300/20 bg-[#11172B]/90 px-3 py-1 text-[9px] text-rose-200 backdrop-blur-xl">
          {error}
        </p>
      </main>
    );
  }

  if (snapshot === null) {
    return (
      <main className="relative flex h-screen w-screen items-end justify-center overflow-hidden bg-transparent pb-2">
        <img
          alt="星际水滴精灵正在读取状态"
          className="h-40 w-40 animate-pulse object-contain"
          draggable={false}
          src="/pet/unknown-fallback.png"
        />
        <p className="absolute bottom-2 rounded-full border border-cyan-200/15 bg-[#11172B]/90 px-3 py-1 text-[9px] text-slate-300 backdrop-blur-xl">
          正在读取 server20…
        </p>
      </main>
    );
  }

  return (
    <PetView
      onTriggerBuild={triggerBuild}
      onTriggerProductionBuild={triggerProductionBuild}
      snapshot={snapshot}
    />
  );
}

export default App;
