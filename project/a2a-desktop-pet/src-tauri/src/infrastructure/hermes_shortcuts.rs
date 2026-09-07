use serde::{Deserialize, Serialize};
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::Path,
    process::{Command, Stdio},
    thread,
    time::Duration,
};

const TOOLS_HOME_URL: &str = "http://localhost:5051/";
const LIVETALKING_URL: &str = "http://127.0.0.1:15173/livetalking/";
const TOOLS_HOME_ROOT: &str = "/Users/wuyangfan/Desktop/project/zhencai/other";
const TOOLS_HOME_SCRIPT: &str = "/Users/wuyangfan/Desktop/project/zhencai/other/restart.sh";
const LIVETALKING_ROOT: &str = "/Users/wuyangfan/Documents/Codex/2026-08-03/new-chat";
const LIVETALKING_SCRIPT: &str =
    "/Users/wuyangfan/Documents/Codex/2026-08-03/new-chat/scripts/start-local-web.sh";
const PROBLEM_LIBRARY: &str = "/Users/wuyangfan/Documents/Codex/2026-07-14/co-de/outputs/codeforces-atcoder-zh-titles/dist/pages/problems-11001-12000.html";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum HermesShortcut {
    ToolsHome,
    LiveTalking,
    ProblemLibrary,
    CodexIndex,
    ProviderToggle,
}

#[derive(Clone, Copy, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum HermesShortcutStatus {
    Opened,
    Starting,
    Unavailable,
    Disabled,
}

#[derive(Clone, Copy, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HermesShortcutResult {
    pub status: HermesShortcutStatus,
}

#[derive(Default)]
pub struct HermesShortcutService;

impl HermesShortcutService {
    pub fn run(&self, action: HermesShortcut) -> HermesShortcutResult {
        match action {
            HermesShortcut::ToolsHome => launch_service(
                5051,
                TOOLS_HOME_URL,
                TOOLS_HOME_ROOT,
                TOOLS_HOME_SCRIPT,
                Duration::from_secs(25),
            ),
            HermesShortcut::LiveTalking => launch_service(
                15173,
                LIVETALKING_URL,
                LIVETALKING_ROOT,
                LIVETALKING_SCRIPT,
                Duration::from_secs(30),
            ),
            HermesShortcut::ProblemLibrary => open_problem_library(),
            HermesShortcut::CodexIndex => open_existing_file(
                "/Users/wuyangfan/Documents/Codex/2026-07-20/new-chat-2/outputs/index.html",
            ),
            HermesShortcut::ProviderToggle => HermesShortcutResult {
                status: HermesShortcutStatus::Disabled,
            },
        }
    }
}

fn launch_service(
    port: u16,
    url: &'static str,
    root: &'static str,
    script: &'static str,
    timeout: Duration,
) -> HermesShortcutResult {
    if port_is_open(port) {
        return if open_path(url) {
            HermesShortcutResult {
                status: HermesShortcutStatus::Opened,
            }
        } else {
            HermesShortcutResult {
                status: HermesShortcutStatus::Unavailable,
            }
        };
    }
    if !Path::new(script).is_file() {
        return HermesShortcutResult {
            status: HermesShortcutStatus::Unavailable,
        };
    }
    let started = Command::new("bash")
        .arg(script)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok();
    if !started {
        return HermesShortcutResult {
            status: HermesShortcutStatus::Unavailable,
        };
    }
    thread::spawn(move || {
        let retries = (timeout.as_millis() / 500) as usize;
        for _ in 0..retries {
            if port_is_open(port) {
                let _ = open_path(url);
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
    HermesShortcutResult {
        status: HermesShortcutStatus::Starting,
    }
}

fn open_problem_library() -> HermesShortcutResult {
    open_existing_file(PROBLEM_LIBRARY)
}

fn open_existing_file(target: &str) -> HermesShortcutResult {
    if !Path::new(target).is_file() || !open_path(target) {
        return HermesShortcutResult {
            status: HermesShortcutStatus::Unavailable,
        };
    }
    HermesShortcutResult {
        status: HermesShortcutStatus::Opened,
    }
}

fn open_path(target: &str) -> bool {
    Command::new("open")
        .arg(target)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok()
}

fn port_is_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
        Duration::from_millis(250),
    )
    .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_toggle_is_permanently_disabled() {
        assert_eq!(
            HermesShortcutService
                .run(HermesShortcut::ProviderToggle)
                .status,
            HermesShortcutStatus::Disabled
        );
    }
}
