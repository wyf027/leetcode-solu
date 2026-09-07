export type DeploymentState = "deployed" | "deploying" | "failed" | "unknown";
export type ProductionDeploymentState = DeploymentState | "promotionSucceeded";
export type ProductionBuildTriggerOutcome = "submitted" | "cancelled";
export type ServiceKind = "frontend" | "backend";

export interface ServiceDeploymentStatus {
  service: ServiceKind;
  label: string;
  state: DeploymentState;
  detail: string;
  buildNumber: number | null;
  updatedAt: string;
}

export interface ProductionDeploymentStatus {
  label: string;
  state: ProductionDeploymentState;
  detail: string;
  buildNumber: number | null;
  updatedAt: string;
}

export interface DeploymentSnapshot {
  frontend: ServiceDeploymentStatus;
  backend: ServiceDeploymentStatus;
  productionFrontend: ProductionDeploymentStatus;
  productionBackend: ProductionDeploymentStatus;
  dominantState: DeploymentState;
  jenkinsConfigured: boolean;
}

export interface CredentialStatus {
  configured: boolean;
  username: string | null;
}

export type CodexQuota =
  { state: "available"; remainingPercent: number } | { state: "unavailable" };

export type HermesShortcut =
  | "toolsHome"
  | "liveTalking"
  | "problemLibrary"
  | "codexIndex"
  | "providerToggle";

export interface HermesShortcutResult {
  status: "opened" | "starting" | "unavailable" | "disabled";
}
