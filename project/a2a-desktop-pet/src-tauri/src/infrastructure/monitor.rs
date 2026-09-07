use std::time::Duration;

use reqwest::{redirect::Policy, Client, StatusCode};
use serde::Deserialize;

use crate::domain::{
    DeploymentSnapshot, DeploymentState, ProductionDeploymentState, ProductionDeploymentStatus,
    ServiceDeploymentStatus, ServiceKind,
};

use super::{CredentialStore, JenkinsCredentials};

const JENKINS_BASE_URL: &str = "http://172.16.1.20:18140";
const FRONTEND_JOB: &str = "aihire-test-frontend";
const BACKEND_JOB: &str = "aihire-test-backend";
const PRODUCTION_FRONTEND_JOB: &str = "aihire-prod-frontend";
const PRODUCTION_BACKEND_JOB: &str = "aihire-prod-backend";
const CREDENTIAL_VALIDATION_JOBS: [&str; 2] = [FRONTEND_JOB, BACKEND_JOB];
const FRONTEND_PROBE_URL: &str = "http://172.16.1.20:19430/b";
const BACKEND_PROBE_URL: &str = "http://172.16.1.20:18131/health/ready";
const PRODUCTION_FRONTEND_PROBE_URL: &str = "https://aihire.succaiss.com/login";
const PRODUCTION_EDGE_HEADER: &str = "x-openhire-edge-cluster";
const PRODUCTION_EDGE_IDENTITY: &str = "openhire-prod";

#[derive(Clone)]
pub struct DeploymentMonitor {
    client: Client,
    jenkins_base_url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JenkinsBuild {
    number: u64,
    building: bool,
    result: Option<String>,
    #[allow(dead_code)]
    url: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct HealthObservation {
    reachable: bool,
    status: Option<StatusCode>,
    route_verified: bool,
}

impl DeploymentMonitor {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .redirect(Policy::limited(3))
            .user_agent("A2A-Deployment-Pet/0.1")
            .build()
            .map_err(|_| "无法初始化只读 HTTP 客户端".to_owned())?;

        Ok(Self {
            client,
            jenkins_base_url: JENKINS_BASE_URL.to_owned(),
        })
    }

    #[cfg(test)]
    fn with_jenkins_base_url(base_url: String) -> Self {
        let mut monitor = Self::new().expect("initialize test deployment monitor");
        monitor.jenkins_base_url = base_url;
        monitor
    }

    pub async fn refresh(&self) -> DeploymentSnapshot {
        let credentials = tokio::task::spawn_blocking(CredentialStore::load)
            .await
            .ok()
            .and_then(Result::ok)
            .flatten();

        let (
            frontend_build,
            backend_build,
            production_frontend_build,
            production_backend_build,
            frontend_health,
            backend_health,
            production_frontend_health,
        ) = tokio::join!(
            self.fetch_build(FRONTEND_JOB, credentials.as_ref()),
            self.fetch_build(BACKEND_JOB, credentials.as_ref()),
            self.fetch_build(PRODUCTION_FRONTEND_JOB, credentials.as_ref()),
            self.fetch_build(PRODUCTION_BACKEND_JOB, credentials.as_ref()),
            self.probe(FRONTEND_PROBE_URL),
            self.probe(BACKEND_PROBE_URL),
            self.probe_production_frontend(),
        );

        DeploymentSnapshot::live(
            Self::service_status(
                ServiceKind::Frontend,
                frontend_build,
                frontend_health,
                credentials.is_some(),
            ),
            Self::service_status(
                ServiceKind::Backend,
                backend_build,
                backend_health,
                credentials.is_some(),
            ),
            Self::production_frontend_status(
                production_frontend_build,
                production_frontend_health,
                credentials.is_some(),
            ),
            Self::production_backend_status(production_backend_build, credentials.is_some()),
            credentials.is_some(),
        )
    }

    pub async fn validate_credentials(
        &self,
        credentials: &JenkinsCredentials,
    ) -> Result<(), String> {
        let (frontend, backend) = tokio::join!(
            self.fetch_build(CREDENTIAL_VALIDATION_JOBS[0], Some(credentials)),
            self.fetch_build(CREDENTIAL_VALIDATION_JOBS[1], Some(credentials)),
        );

        frontend
            .and(backend)
            .map(|_| ())
            .map_err(|error| error.copy(true).to_owned())
    }

    pub async fn trigger_build(&self, service: ServiceKind) -> Result<(), String> {
        let credentials = tokio::task::spawn_blocking(CredentialStore::load)
            .await
            .map_err(|_| "读取 macOS Keychain 任务失败".to_owned())??
            .ok_or_else(|| "请先配置 Jenkins 凭据".to_owned())?;
        let job = Self::job(service);
        let query = Self::build_query(service);
        let url = format!(
            "{}/job/{job}/buildWithParameters?{query}",
            self.jenkins_base_url
        );
        self.submit_build_url(url, &credentials).await
    }

    pub async fn trigger_production_build(&self, service: ServiceKind) -> Result<(), String> {
        let credentials = tokio::task::spawn_blocking(CredentialStore::load)
            .await
            .map_err(|_| "读取 macOS Keychain 任务失败".to_owned())??
            .ok_or_else(|| "请先配置 Jenkins 凭据".to_owned())?;
        self.submit_production_build_with_credentials(service, &credentials)
            .await
    }

    async fn submit_production_build_with_credentials(
        &self,
        service: ServiceKind,
        credentials: &JenkinsCredentials,
    ) -> Result<(), String> {
        let url = format!(
            "{}/job/{}/build",
            self.jenkins_base_url,
            Self::production_job(service)
        );
        self.submit_build_url(url, credentials).await
    }

    async fn submit_build_url(
        &self,
        url: String,
        credentials: &JenkinsCredentials,
    ) -> Result<(), String> {
        let response = self
            .client
            .post(url)
            .basic_auth(&credentials.username, Some(&credentials.token))
            .send()
            .await
            .map_err(|_| "Jenkins 当前不可达，构建未提交".to_owned())?;

        match response.status() {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                Err("Jenkins 凭据无效或没有构建权限".to_owned())
            }
            StatusCode::CONFLICT => Err("Jenkins 当前不接受新的构建请求".to_owned()),
            status if status.is_success() => Ok(()),
            status => Err(format!("Jenkins 拒绝构建请求（HTTP {}）", status.as_u16())),
        }
    }

    const fn job(service: ServiceKind) -> &'static str {
        match service {
            ServiceKind::Frontend => FRONTEND_JOB,
            ServiceKind::Backend => BACKEND_JOB,
        }
    }

    const fn production_job(service: ServiceKind) -> &'static str {
        match service {
            ServiceKind::Frontend => PRODUCTION_FRONTEND_JOB,
            ServiceKind::Backend => PRODUCTION_BACKEND_JOB,
        }
    }

    const fn build_query(service: ServiceKind) -> &'static str {
        match service {
            ServiceKind::Frontend => "FORCE_DEPLOY=false",
            ServiceKind::Backend => "FORCE_DEPLOY=false&RUN_AGENT_LLM_E2E=false",
        }
    }

    async fn fetch_build(
        &self,
        job: &str,
        credentials: Option<&JenkinsCredentials>,
    ) -> Result<JenkinsBuild, JenkinsReadError> {
        let Some(credentials) = credentials else {
            return Err(JenkinsReadError::NotConfigured);
        };
        let url = format!(
            "{}/job/{job}/lastBuild/api/json?tree=number,building,result,url",
            self.jenkins_base_url
        );
        let response = self
            .client
            .get(url)
            .basic_auth(&credentials.username, Some(&credentials.token))
            .send()
            .await
            .map_err(|_| JenkinsReadError::Unavailable)?;

        match response.status() {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(JenkinsReadError::Unauthorized),
            status if status.is_success() => response
                .json::<JenkinsBuild>()
                .await
                .map_err(|_| JenkinsReadError::InvalidResponse),
            _ => Err(JenkinsReadError::Unavailable),
        }
    }

    async fn probe(&self, url: &str) -> HealthObservation {
        match self.client.get(url).send().await {
            Ok(response) => HealthObservation {
                reachable: response.status().is_success() || response.status().is_redirection(),
                status: Some(response.status()),
                route_verified: true,
            },
            Err(_) => HealthObservation {
                reachable: false,
                status: None,
                route_verified: false,
            },
        }
    }

    async fn probe_production_frontend(&self) -> HealthObservation {
        match self.client.get(PRODUCTION_FRONTEND_PROBE_URL).send().await {
            Ok(response) => {
                let status = response.status();
                let route_verified = response
                    .headers()
                    .get(PRODUCTION_EDGE_HEADER)
                    .and_then(|value| value.to_str().ok())
                    == Some(PRODUCTION_EDGE_IDENTITY);

                HealthObservation {
                    reachable: (status.is_success() || status.is_redirection()) && route_verified,
                    status: Some(status),
                    route_verified,
                }
            }
            Err(_) => HealthObservation {
                reachable: false,
                status: None,
                route_verified: false,
            },
        }
    }

    fn service_status(
        service: ServiceKind,
        build: Result<JenkinsBuild, JenkinsReadError>,
        health: HealthObservation,
        credentials_configured: bool,
    ) -> ServiceDeploymentStatus {
        let health_copy = health.copy();

        match build {
            Ok(build) if build.building => ServiceDeploymentStatus::live(
                service,
                DeploymentState::Deploying,
                format!("Jenkins 正在发布；{health_copy}"),
                Some(build.number),
            ),
            Ok(build) if build.result.as_deref() == Some("SUCCESS") && health.reachable => {
                ServiceDeploymentStatus::live(
                    service,
                    DeploymentState::Deployed,
                    format!("Jenkins 构建成功；{health_copy}"),
                    Some(build.number),
                )
            }
            Ok(build) if build.result.as_deref() == Some("SUCCESS") => {
                ServiceDeploymentStatus::live(
                    service,
                    DeploymentState::Unknown,
                    "发布成功，但服务健康尚未确认".to_owned(),
                    Some(build.number),
                )
            }
            Ok(build) if build.result.is_some() => ServiceDeploymentStatus::live(
                service,
                DeploymentState::Failed,
                if health.reachable {
                    "新版本部署失败，旧版本仍可用".to_owned()
                } else {
                    "新版本部署失败，服务健康检查也未通过".to_owned()
                },
                Some(build.number),
            ),
            Ok(build) => ServiceDeploymentStatus::live(
                service,
                DeploymentState::Unknown,
                format!("Jenkins 构建结果缺失；{health_copy}"),
                Some(build.number),
            ),
            Err(error) => ServiceDeploymentStatus::live(
                service,
                DeploymentState::Unknown,
                format!("{}；{health_copy}", error.copy(credentials_configured)),
                None,
            ),
        }
    }

    fn production_frontend_status(
        build: Result<JenkinsBuild, JenkinsReadError>,
        health: HealthObservation,
        credentials_configured: bool,
    ) -> ProductionDeploymentStatus {
        let health_copy = health.copy();

        match build {
            Ok(build) if build.building => ProductionDeploymentStatus::live(
                "生产前端",
                ProductionDeploymentState::Deploying,
                format!("Jenkins 正在晋级；{health_copy}"),
                Some(build.number),
            ),
            Ok(build) if build.result.as_deref() == Some("SUCCESS") && health.reachable => {
                ProductionDeploymentStatus::live(
                    "生产前端",
                    ProductionDeploymentState::Deployed,
                    format!("Jenkins 晋级成功；{health_copy}"),
                    Some(build.number),
                )
            }
            Ok(build) if build.result.as_deref() == Some("SUCCESS") => {
                ProductionDeploymentStatus::live(
                    "生产前端",
                    ProductionDeploymentState::Unknown,
                    format!("晋级成功，但生产路由尚未确认；{health_copy}"),
                    Some(build.number),
                )
            }
            Ok(build) if build.result.is_some() => ProductionDeploymentStatus::live(
                "生产前端",
                ProductionDeploymentState::Failed,
                if health.reachable {
                    "最新生产晋级失败，现有版本仍可用".to_owned()
                } else {
                    "最新生产晋级失败，生产路由检查也未通过".to_owned()
                },
                Some(build.number),
            ),
            Ok(build) => ProductionDeploymentStatus::live(
                "生产前端",
                ProductionDeploymentState::Unknown,
                format!("Jenkins 晋级结果缺失；{health_copy}"),
                Some(build.number),
            ),
            Err(error) => ProductionDeploymentStatus::live(
                "生产前端",
                ProductionDeploymentState::Unknown,
                format!("{}；{health_copy}", error.copy(credentials_configured)),
                None,
            ),
        }
    }

    fn production_backend_status(
        build: Result<JenkinsBuild, JenkinsReadError>,
        credentials_configured: bool,
    ) -> ProductionDeploymentStatus {
        const HEALTH_GAP: &str = "生产后端无独立健康探针";

        match build {
            Ok(build) if build.building => ProductionDeploymentStatus::live(
                "生产后端",
                ProductionDeploymentState::Deploying,
                format!("Jenkins 正在晋级；{HEALTH_GAP}"),
                Some(build.number),
            ),
            Ok(build) if build.result.as_deref() == Some("SUCCESS") => {
                ProductionDeploymentStatus::live(
                    "生产后端",
                    ProductionDeploymentState::PromotionSucceeded,
                    format!("Jenkins 晋级成功；{HEALTH_GAP}"),
                    Some(build.number),
                )
            }
            Ok(build) if build.result.is_some() => ProductionDeploymentStatus::live(
                "生产后端",
                ProductionDeploymentState::Failed,
                format!("最新生产晋级失败；{HEALTH_GAP}"),
                Some(build.number),
            ),
            Ok(build) => ProductionDeploymentStatus::live(
                "生产后端",
                ProductionDeploymentState::Unknown,
                format!("Jenkins 晋级结果缺失；{HEALTH_GAP}"),
                Some(build.number),
            ),
            Err(error) => ProductionDeploymentStatus::live(
                "生产后端",
                ProductionDeploymentState::Unknown,
                format!("{}；{HEALTH_GAP}", error.copy(credentials_configured)),
                None,
            ),
        }
    }
}

impl HealthObservation {
    fn copy(self) -> String {
        if !self.route_verified && self.status.is_some() {
            return match self.status {
                Some(status) => format!("生产路由身份未确认 ({})", status.as_u16()),
                None => "生产路由身份未确认".to_owned(),
            };
        }

        if self.reachable {
            match self.status {
                Some(status) => format!("实时路由可达 ({})", status.as_u16()),
                None => "实时路由可达".to_owned(),
            }
        } else {
            "实时路由不可达".to_owned()
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum JenkinsReadError {
    NotConfigured,
    Unauthorized,
    Unavailable,
    InvalidResponse,
}

impl JenkinsReadError {
    fn copy(self, credentials_configured: bool) -> &'static str {
        match self {
            Self::NotConfigured => "请配置 Jenkins 只读凭据",
            Self::Unauthorized if credentials_configured => "Jenkins 凭据无效或权限不足",
            Self::Unauthorized => "请配置 Jenkins 只读凭据",
            Self::Unavailable => "Jenkins 当前不可达",
            Self::InvalidResponse => "Jenkins 返回了无法识别的数据",
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    use super::*;

    fn capture_one_request() -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback capture server");
        let address = listener.local_addr().expect("read capture server address");
        let request = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept Jenkins request");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 1024];

            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let bytes_read = stream.read(&mut buffer).expect("read Jenkins request");
                if bytes_read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..bytes_read]);
            }

            stream
                .write_all(
                    b"HTTP/1.1 201 Created\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .expect("write Jenkins response");

            String::from_utf8(request).expect("capture request should be UTF-8")
        });

        (format!("http://{address}"), request)
    }

    #[tokio::test]
    async fn production_submission_posts_only_to_fixed_parameterless_endpoints() {
        for (service, expected_path) in [
            (ServiceKind::Frontend, "/job/aihire-prod-frontend/build"),
            (ServiceKind::Backend, "/job/aihire-prod-backend/build"),
        ] {
            let (base_url, request) = capture_one_request();
            let monitor = DeploymentMonitor::with_jenkins_base_url(base_url);
            monitor
                .submit_production_build_with_credentials(
                    service,
                    &JenkinsCredentials {
                        username: "test-user".to_owned(),
                        token: "test-token".to_owned(),
                    },
                )
                .await
                .expect("fixed production request should be accepted");

            let request = request.join().expect("capture request");
            assert!(request.starts_with(&format!("POST {expected_path} HTTP/1.1\r\n")));
            assert!(!request.starts_with(&format!("POST {expected_path}?")));
            assert!(!request.contains("FORCE_DEPLOY"));
            assert!(!request.contains("RUN_AGENT_LLM_E2E"));
        }
    }

    #[test]
    fn monitors_current_server20_aihire_test_jobs() {
        assert_eq!(FRONTEND_JOB, "aihire-test-frontend");
        assert_eq!(BACKEND_JOB, "aihire-test-backend");
        assert_eq!(PRODUCTION_FRONTEND_JOB, "aihire-prod-frontend");
        assert_eq!(PRODUCTION_BACKEND_JOB, "aihire-prod-backend");
    }

    #[test]
    fn credential_validation_scope_excludes_read_only_production_jobs() {
        assert_eq!(
            CREDENTIAL_VALIDATION_JOBS,
            ["aihire-test-frontend", "aihire-test-backend"]
        );
        assert!(!CREDENTIAL_VALIDATION_JOBS.contains(&PRODUCTION_FRONTEND_JOB));
        assert!(!CREDENTIAL_VALIDATION_JOBS.contains(&PRODUCTION_BACKEND_JOB));
    }

    #[test]
    fn trigger_contract_uses_only_safe_fixed_parameters() {
        assert_eq!(
            DeploymentMonitor::build_query(ServiceKind::Frontend),
            "FORCE_DEPLOY=false"
        );
        assert_eq!(
            DeploymentMonitor::build_query(ServiceKind::Backend),
            "FORCE_DEPLOY=false&RUN_AGENT_LLM_E2E=false"
        );
    }

    fn health(reachable: bool) -> HealthObservation {
        HealthObservation {
            reachable,
            status: reachable.then_some(StatusCode::OK),
            route_verified: true,
        }
    }

    fn build(building: bool, result: Option<&str>) -> JenkinsBuild {
        JenkinsBuild {
            number: 42,
            building,
            result: result.map(str::to_owned),
            url: None,
        }
    }

    #[test]
    fn active_build_wins_over_current_health() {
        let status = DeploymentMonitor::service_status(
            ServiceKind::Frontend,
            Ok(build(true, None)),
            health(true),
            true,
        );

        assert_eq!(status.state, DeploymentState::Deploying);
        assert_eq!(status.build_number, Some(42));
    }

    #[test]
    fn failed_build_stays_failed_when_old_version_is_healthy() {
        let status = DeploymentMonitor::service_status(
            ServiceKind::Backend,
            Ok(build(false, Some("FAILURE"))),
            health(true),
            true,
        );

        assert_eq!(status.state, DeploymentState::Failed);
        assert!(status.detail.contains("旧版本仍可用"));
    }

    #[test]
    fn successful_build_requires_reachable_service() {
        let status = DeploymentMonitor::service_status(
            ServiceKind::Backend,
            Ok(build(false, Some("SUCCESS"))),
            health(false),
            true,
        );

        assert_eq!(status.state, DeploymentState::Unknown);
        assert!(status.detail.contains("健康尚未确认"));
    }

    #[test]
    fn missing_credentials_do_not_hide_live_probe_result() {
        let status = DeploymentMonitor::service_status(
            ServiceKind::Frontend,
            Err(JenkinsReadError::NotConfigured),
            health(true),
            false,
        );

        assert_eq!(status.state, DeploymentState::Unknown);
        assert!(status.detail.contains("实时路由可达"));
    }

    #[test]
    fn production_frontend_success_requires_verified_production_route() {
        let status = DeploymentMonitor::production_frontend_status(
            Ok(build(false, Some("SUCCESS"))),
            HealthObservation {
                reachable: false,
                status: Some(StatusCode::OK),
                route_verified: false,
            },
            true,
        );

        assert_eq!(status.state, ProductionDeploymentState::Unknown);
        assert!(status.detail.contains("生产路由身份未确认"));
    }

    #[test]
    fn production_backend_success_reports_the_health_probe_gap() {
        let status =
            DeploymentMonitor::production_backend_status(Ok(build(false, Some("SUCCESS"))), true);

        assert_eq!(status.state, ProductionDeploymentState::PromotionSucceeded);
        assert!(status.detail.contains("无独立健康探针"));
    }
}
