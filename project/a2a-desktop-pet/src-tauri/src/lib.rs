mod domain;
mod infrastructure;

use domain::{DeploymentSnapshot, ServiceKind};
use infrastructure::{
    CodexQuota, CodexQuotaProvider, CredentialStatus, CredentialStore, DeploymentMonitor,
    HermesShortcut, HermesShortcutResult, HermesShortcutService, JenkinsCredentials,
};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    LogicalSize, Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

const HOVER_SIZE: (f64, f64) = (220.0, 252.0);
const EXPANDED_SIZE: (f64, f64) = (360.0, 368.0);

#[tauri::command]
async fn get_deployment_snapshot(
    monitor: tauri::State<'_, DeploymentMonitor>,
) -> Result<DeploymentSnapshot, String> {
    Ok(monitor.refresh().await)
}

#[tauri::command]
async fn get_credential_status() -> Result<CredentialStatus, String> {
    tokio::task::spawn_blocking(CredentialStore::status)
        .await
        .map_err(|_| "读取 macOS Keychain 任务失败".to_owned())?
}

#[tauri::command]
async fn save_jenkins_credentials(
    monitor: tauri::State<'_, DeploymentMonitor>,
    username: String,
    token: String,
) -> Result<CredentialStatus, String> {
    if username.trim().is_empty() || token.trim().is_empty() {
        return Err("Jenkins 用户名和 API Token 不能为空".to_owned());
    }
    monitor
        .validate_credentials(&JenkinsCredentials {
            username: username.trim().to_owned(),
            token: token.trim().to_owned(),
        })
        .await?;

    tokio::task::spawn_blocking(move || CredentialStore::save(username, token))
        .await
        .map_err(|_| "写入 macOS Keychain 任务失败".to_owned())?
}

#[tauri::command]
async fn clear_jenkins_credentials() -> Result<CredentialStatus, String> {
    tokio::task::spawn_blocking(CredentialStore::clear)
        .await
        .map_err(|_| "清理 macOS Keychain 任务失败".to_owned())?
}

#[tauri::command]
async fn trigger_jenkins_build(
    monitor: tauri::State<'_, DeploymentMonitor>,
    service: ServiceKind,
) -> Result<(), String> {
    monitor.trigger_build(service).await
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
enum ProductionBuildTriggerOutcome {
    Submitted,
    Cancelled,
}

async fn run_production_build<C, ConfirmationFuture, S, SubmissionFuture>(
    service: ServiceKind,
    confirm: C,
    submit: S,
) -> Result<ProductionBuildTriggerOutcome, String>
where
    C: FnOnce(ServiceKind) -> ConfirmationFuture,
    ConfirmationFuture: std::future::Future<Output = Result<bool, String>>,
    S: FnOnce(ServiceKind) -> SubmissionFuture,
    SubmissionFuture: std::future::Future<Output = Result<(), String>>,
{
    if !confirm(service).await? {
        return Ok(ProductionBuildTriggerOutcome::Cancelled);
    }
    submit(service).await?;
    Ok(ProductionBuildTriggerOutcome::Submitted)
}

const fn service_copy(service: ServiceKind) -> &'static str {
    match service {
        ServiceKind::Frontend => "前端",
        ServiceKind::Backend => "后端",
    }
}

const fn production_target_copy(service: ServiceKind) -> &'static str {
    match service {
        ServiceKind::Frontend => "生产前端",
        ServiceKind::Backend => "生产后端",
    }
}

async fn confirm_production_build(
    app: tauri::AppHandle,
    service: ServiceKind,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(format!(
                "将把最新成功的 Test {}版本晋级到生产环境。是否继续？",
                service_copy(service)
            ))
            .title(format!("确认{}晋级", production_target_copy(service)))
            .buttons(MessageDialogButtons::OkCancelCustom(
                "确认晋级".to_owned(),
                "取消".to_owned(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|_| "显示生产晋级确认窗口失败".to_owned())
}

#[tauri::command]
async fn trigger_production_jenkins_build(
    app: tauri::AppHandle,
    monitor: tauri::State<'_, DeploymentMonitor>,
    service: ServiceKind,
) -> Result<ProductionBuildTriggerOutcome, String> {
    run_production_build(
        service,
        |service| confirm_production_build(app.clone(), service),
        |service| monitor.trigger_production_build(service),
    )
    .await
}

#[tauri::command]
async fn get_codex_quota(
    provider: tauri::State<'_, Arc<CodexQuotaProvider>>,
    force_refresh: bool,
) -> Result<CodexQuota, String> {
    let provider = Arc::clone(&provider);
    tokio::task::spawn_blocking(move || provider.read(force_refresh))
        .await
        .map_err(|_| "读取 Codex 额度任务失败".to_owned())
}

#[tauri::command]
async fn run_hermes_shortcut(
    shortcuts: tauri::State<'_, Arc<HermesShortcutService>>,
    action: HermesShortcut,
) -> Result<HermesShortcutResult, String> {
    let shortcuts = Arc::clone(&shortcuts);
    tokio::task::spawn_blocking(move || shortcuts.run(action))
        .await
        .map_err(|_| "执行 Hermes 快捷入口任务失败".to_owned())
}

fn anchored_position(
    current_position: PhysicalPosition<i32>,
    current_size: (u32, u32),
    target_size: (u32, u32),
) -> PhysicalPosition<i32> {
    let x =
        i64::from(current_position.x) + (i64::from(current_size.0) - i64::from(target_size.0)) / 2;
    let y = i64::from(current_position.y) + i64::from(current_size.1) - i64::from(target_size.1);

    PhysicalPosition::new(x as i32, y as i32)
}

fn set_pet_size(
    window: WebviewWindow,
    (logical_width, logical_height): (f64, f64),
) -> Result<(), String> {
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let current_size = window.outer_size().map_err(|error| error.to_string())?;
    let current_position = window.outer_position().map_err(|error| error.to_string())?;
    let target_logical_size = LogicalSize::new(logical_width, logical_height);
    let target_physical_size = target_logical_size.to_physical::<u32>(scale_factor);
    let mut target_position = anchored_position(
        current_position,
        (current_size.width, current_size.height),
        (target_physical_size.width, target_physical_size.height),
    );

    if let Some(monitor) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
    {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let max_x = monitor_position.x
            + monitor_size
                .width
                .saturating_sub(target_physical_size.width) as i32;
        let max_y = monitor_position.y
            + monitor_size
                .height
                .saturating_sub(target_physical_size.height) as i32;

        target_position.x = target_position.x.clamp(monitor_position.x, max_x);
        target_position.y = if target_position.y < monitor_position.y {
            current_position.y.clamp(monitor_position.y, max_y)
        } else {
            target_position.y.min(max_y)
        };
    }

    window
        .set_size(target_logical_size)
        .map_err(|error| error.to_string())?;
    window
        .set_position(target_position)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_pet_expanded(window: WebviewWindow, expanded: bool) -> Result<(), String> {
    set_pet_size(window, if expanded { EXPANDED_SIZE } else { HOVER_SIZE })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let monitor = DeploymentMonitor::new().expect("failed to initialize deployment monitor");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(monitor)
        .manage(Arc::new(CodexQuotaProvider::default()))
        .manage(Arc::new(HermesShortcutService))
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示桌宠", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏桌宠", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("A2A 部署状态")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }

            tray.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_deployment_snapshot,
            get_credential_status,
            save_jenkins_credentials,
            clear_jenkins_credentials,
            trigger_jenkins_build,
            trigger_production_jenkins_build,
            get_codex_quota,
            run_hermes_shortcut,
            set_pet_expanded,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancelled_native_confirmation_returns_before_production_submission() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };

        let confirmation_calls = Arc::new(AtomicUsize::new(0));
        let submission_calls = Arc::new(AtomicUsize::new(0));
        let confirmation_calls_for_provider = Arc::clone(&confirmation_calls);
        let submission_calls_for_provider = Arc::clone(&submission_calls);

        let outcome = run_production_build(
            ServiceKind::Frontend,
            move |_service| {
                confirmation_calls_for_provider.fetch_add(1, Ordering::SeqCst);
                std::future::ready(Ok(false))
            },
            move |_service| {
                submission_calls_for_provider.fetch_add(1, Ordering::SeqCst);
                std::future::ready(Err("submission must not run after cancel".to_owned()))
            },
        )
        .await
        .expect("cancel is not an error");

        assert_eq!(outcome, ProductionBuildTriggerOutcome::Cancelled);
        assert_eq!(confirmation_calls.load(Ordering::SeqCst), 1);
        assert_eq!(submission_calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn confirmed_native_confirmation_submits_production_build_once() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };

        let confirmation_calls = Arc::new(AtomicUsize::new(0));
        let submission_calls = Arc::new(AtomicUsize::new(0));
        let confirmation_calls_for_provider = Arc::clone(&confirmation_calls);
        let submission_calls_for_provider = Arc::clone(&submission_calls);

        let outcome = run_production_build(
            ServiceKind::Backend,
            move |service| {
                assert_eq!(service, ServiceKind::Backend);
                confirmation_calls_for_provider.fetch_add(1, Ordering::SeqCst);
                std::future::ready(Ok(true))
            },
            move |service| {
                assert_eq!(service, ServiceKind::Backend);
                submission_calls_for_provider.fetch_add(1, Ordering::SeqCst);
                std::future::ready(Ok(()))
            },
        )
        .await
        .expect("confirmed production build should submit");

        assert_eq!(outcome, ProductionBuildTriggerOutcome::Submitted);
        assert_eq!(confirmation_calls.load(Ordering::SeqCst), 1);
        assert_eq!(submission_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn resize_keeps_horizontal_center_and_bottom_edge_stable() {
        let target = anchored_position(PhysicalPosition::new(400, 500), (256, 288), (720, 736));

        assert_eq!(target, PhysicalPosition::new(168, 52));
        assert_eq!(target.x + 720 / 2, 400 + 256 / 2);
        assert_eq!(target.y + 736, 500 + 288);
    }
}
