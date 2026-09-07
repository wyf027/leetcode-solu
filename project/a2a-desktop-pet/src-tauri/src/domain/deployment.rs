use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceKind {
    Frontend,
    Backend,
}

impl ServiceKind {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Frontend => "A2A 前端",
            Self::Backend => "A2A 后端",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DeploymentState {
    Deployed,
    Deploying,
    Failed,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProductionDeploymentState {
    Deployed,
    Deploying,
    Failed,
    PromotionSucceeded,
    Unknown,
}

impl DeploymentState {
    pub const fn priority(self) -> u8 {
        match self {
            Self::Failed => 4,
            Self::Deploying => 3,
            Self::Deployed => 2,
            Self::Unknown => 1,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDeploymentStatus {
    pub service: ServiceKind,
    pub label: String,
    pub state: DeploymentState,
    pub detail: String,
    pub build_number: Option<u64>,
    pub updated_at: String,
}

impl ServiceDeploymentStatus {
    pub fn live(
        service: ServiceKind,
        state: DeploymentState,
        detail: String,
        build_number: Option<u64>,
    ) -> Self {
        Self {
            service,
            label: service.label().to_owned(),
            state,
            detail,
            build_number,
            updated_at: "刚刚".to_owned(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionDeploymentStatus {
    pub label: String,
    pub state: ProductionDeploymentState,
    pub detail: String,
    pub build_number: Option<u64>,
    pub updated_at: String,
}

impl ProductionDeploymentStatus {
    pub fn live(
        label: &str,
        state: ProductionDeploymentState,
        detail: String,
        build_number: Option<u64>,
    ) -> Self {
        Self {
            label: label.to_owned(),
            state,
            detail,
            build_number,
            updated_at: "刚刚".to_owned(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentSnapshot {
    pub frontend: ServiceDeploymentStatus,
    pub backend: ServiceDeploymentStatus,
    pub production_frontend: ProductionDeploymentStatus,
    pub production_backend: ProductionDeploymentStatus,
    pub dominant_state: DeploymentState,
    pub jenkins_configured: bool,
}

impl DeploymentSnapshot {
    pub fn live(
        frontend: ServiceDeploymentStatus,
        backend: ServiceDeploymentStatus,
        production_frontend: ProductionDeploymentStatus,
        production_backend: ProductionDeploymentStatus,
        jenkins_configured: bool,
    ) -> Self {
        let dominant_state = if frontend.state.priority() >= backend.state.priority() {
            frontend.state
        } else {
            backend.state
        };

        Self {
            frontend,
            backend,
            production_frontend,
            production_backend,
            dominant_state,
            jenkins_configured,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_state_wins_over_deploying_state() {
        let snapshot = DeploymentSnapshot::live(
            ServiceDeploymentStatus::live(
                ServiceKind::Frontend,
                DeploymentState::Deploying,
                "deploying".to_owned(),
                Some(1),
            ),
            ServiceDeploymentStatus::live(
                ServiceKind::Backend,
                DeploymentState::Failed,
                "failed".to_owned(),
                Some(2),
            ),
            ProductionDeploymentStatus::live(
                "生产前端",
                ProductionDeploymentState::Deployed,
                "deployed".to_owned(),
                Some(3),
            ),
            ProductionDeploymentStatus::live(
                "生产后端",
                ProductionDeploymentState::PromotionSucceeded,
                "deployed".to_owned(),
                Some(4),
            ),
            true,
        );

        assert_eq!(snapshot.dominant_state, DeploymentState::Failed);
    }

    #[test]
    fn production_status_does_not_change_the_test_mascot_state() {
        let snapshot = DeploymentSnapshot::live(
            ServiceDeploymentStatus::live(
                ServiceKind::Frontend,
                DeploymentState::Deployed,
                "deployed".to_owned(),
                Some(1),
            ),
            ServiceDeploymentStatus::live(
                ServiceKind::Backend,
                DeploymentState::Deployed,
                "deployed".to_owned(),
                Some(2),
            ),
            ProductionDeploymentStatus::live(
                "生产前端",
                ProductionDeploymentState::Failed,
                "failed".to_owned(),
                Some(3),
            ),
            ProductionDeploymentStatus::live(
                "生产后端",
                ProductionDeploymentState::Deploying,
                "deploying".to_owned(),
                Some(4),
            ),
            true,
        );

        assert_eq!(snapshot.dominant_state, DeploymentState::Deployed);
    }
}
