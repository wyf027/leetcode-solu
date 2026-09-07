use serde::Serialize;
use serde_json::{json, Value};
use std::{
    env,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};

const CACHE_TTL: Duration = Duration::from_secs(60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const STANDALONE_CODEX_PATH: &str = ".codex/packages/standalone/current/codex";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum CodexQuota {
    Available {
        #[serde(rename = "remainingPercent")]
        remaining_percent: u8,
    },
    Unavailable,
}

#[derive(Clone)]
struct CachedQuota {
    value: CodexQuota,
    refreshed_at: Instant,
}

pub struct CodexQuotaProvider {
    cache: Mutex<Option<CachedQuota>>,
}

impl Default for CodexQuotaProvider {
    fn default() -> Self {
        Self {
            cache: Mutex::new(None),
        }
    }
}

impl CodexQuotaProvider {
    pub fn read(&self, force_refresh: bool) -> CodexQuota {
        let now = Instant::now();
        if let Ok(cache) = self.cache.lock() {
            if let Some(entry) = cache
                .as_ref()
                .filter(|entry| should_use_cache(entry, now, force_refresh))
            {
                return entry.value.clone();
            }
        }

        let value = read_rate_limit_quota().unwrap_or(CodexQuota::Unavailable);
        if let Ok(mut cache) = self.cache.lock() {
            *cache = Some(CachedQuota {
                value: value.clone(),
                refreshed_at: now,
            });
        }
        value
    }
}

fn cache_is_fresh(entry: &CachedQuota, now: Instant) -> bool {
    now.duration_since(entry.refreshed_at) < CACHE_TTL
}

fn should_use_cache(entry: &CachedQuota, now: Instant, force_refresh: bool) -> bool {
    !force_refresh && cache_is_fresh(entry, now)
}

fn read_rate_limit_quota() -> Result<CodexQuota, ()> {
    let mut client = AppServerClient::spawn()?;
    client.request(
        1,
        "initialize",
        json!({
            "clientInfo": {
                "name": "a2a-deployment-pet",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {}
        }),
    )?;
    client.notify("initialized", Value::Object(Default::default()))?;
    let response = client.request(
        2,
        "account/rateLimits/read",
        Value::Object(Default::default()),
    )?;
    reduce_rate_limits(&response).ok_or(())
}

fn reduce_rate_limits(response: &Value) -> Option<CodexQuota> {
    let limits = response
        .pointer("/rateLimitsByLimitId/codex")
        .or_else(|| response.get("rateLimits"))?;
    let windows = ["primary", "secondary"].map(|name| {
        let window = limits.get(name)?;
        let used = window.get("usedPercent")?.as_u64()?;
        (used <= 100).then(|| {
            (
                used,
                window.get("windowDurationMins").and_then(Value::as_u64),
            )
        })
    });
    let used = windows
        .iter()
        .flatten()
        .filter_map(|(used, duration)| duration.map(|duration| (*used, duration)))
        .max_by_key(|(_, duration)| *duration)
        .map(|(used, _)| used)
        .or_else(|| windows[1].map(|(used, _)| used))
        .or_else(|| windows[0].map(|(used, _)| used))?;

    Some(CodexQuota::Available {
        remaining_percent: 100_u8.saturating_sub(used as u8),
    })
}

struct AppServerClient {
    child: Child,
    stdin: ChildStdin,
    responses: mpsc::Receiver<Value>,
}

impl AppServerClient {
    fn spawn() -> Result<Self, ()> {
        let mut command = Command::new(codex_executable());
        command
            .arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .env("RUST_LOG", "warn");
        let mut child = command.spawn().map_err(|_| ())?;
        let stdin = child.stdin.take().ok_or(())?;
        let stdout = child.stdout.take().ok_or(())?;
        let (sender, responses) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(message) = serde_json::from_str::<Value>(&line) {
                    let _ = sender.send(message);
                }
            }
        });
        Ok(Self {
            child,
            stdin,
            responses,
        })
    }

    fn request(&mut self, id: u64, method: &str, params: Value) -> Result<Value, ()> {
        self.send(json!({ "id": id, "method": method, "params": params }))?;
        loop {
            let message = self
                .responses
                .recv_timeout(REQUEST_TIMEOUT)
                .map_err(|_| ())?;
            if message.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }
            if message.get("error").is_some() {
                return Err(());
            }
            return message.get("result").cloned().ok_or(());
        }
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<(), ()> {
        self.send(json!({ "method": method, "params": params }))
    }

    fn send(&mut self, message: Value) -> Result<(), ()> {
        serde_json::to_writer(&mut self.stdin, &message).map_err(|_| ())?;
        self.stdin.write_all(b"\n").map_err(|_| ())?;
        self.stdin.flush().map_err(|_| ())
    }
}

fn codex_executable() -> PathBuf {
    let home_directory = env::var_os("HOME").map(PathBuf::from);
    let standalone_exists = home_directory
        .as_deref()
        .map(|home| home.join(STANDALONE_CODEX_PATH).is_file())
        .unwrap_or(false);

    select_codex_executable(home_directory.as_deref(), standalone_exists)
}

fn select_codex_executable(home_directory: Option<&Path>, standalone_exists: bool) -> PathBuf {
    home_directory
        .filter(|_| standalone_exists)
        .map(|home| home.join(STANDALONE_CODEX_PATH))
        .unwrap_or_else(|| PathBuf::from("codex"))
}

impl Drop for AppServerClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_available_quota_with_the_frontend_field_name() {
        assert_eq!(
            serde_json::to_value(CodexQuota::Available {
                remaining_percent: 80
            })
            .expect("quota should serialize"),
            json!({ "state": "available", "remainingPercent": 80 })
        );
    }

    #[test]
    fn chooses_the_weekly_window_by_longest_duration() {
        let response = json!({
            "rateLimits": {
                "primary": { "usedPercent": 5, "windowDurationMins": 300 },
                "secondary": { "usedPercent": 16, "windowDurationMins": 10080 }
            }
        });

        assert_eq!(
            reduce_rate_limits(&response),
            Some(CodexQuota::Available {
                remaining_percent: 84
            })
        );
    }

    #[test]
    fn duration_selection_does_not_depend_on_the_window_name() {
        let response = json!({
            "rateLimits": {
                "primary": { "usedPercent": 25, "windowDurationMins": 10080 },
                "secondary": { "usedPercent": 2, "windowDurationMins": 300 }
            }
        });

        assert_eq!(
            reduce_rate_limits(&response),
            Some(CodexQuota::Available {
                remaining_percent: 75
            })
        );
    }

    #[test]
    fn prefers_secondary_when_duration_metadata_is_missing() {
        let response = json!({
            "rateLimits": {
                "primary": { "usedPercent": 5 },
                "secondary": { "usedPercent": 16 }
            }
        });

        assert_eq!(
            reduce_rate_limits(&response),
            Some(CodexQuota::Available {
                remaining_percent: 84
            })
        );
    }

    #[test]
    fn accepts_one_available_rate_limit_window() {
        let response = json!({
            "rateLimits": { "primary": { "usedPercent": 40 } }
        });

        assert_eq!(
            reduce_rate_limits(&response),
            Some(CodexQuota::Available {
                remaining_percent: 60
            })
        );
    }

    #[test]
    fn rejects_missing_or_invalid_rate_limits() {
        assert_eq!(reduce_rate_limits(&json!({})), None);
        assert_eq!(
            reduce_rate_limits(&json!({
                "rateLimits": { "primary": { "usedPercent": 101 } }
            })),
            None
        );
    }

    #[test]
    fn cache_expires_after_sixty_seconds() {
        let entry = CachedQuota {
            value: CodexQuota::Unavailable,
            refreshed_at: Instant::now(),
        };
        assert!(cache_is_fresh(
            &entry,
            entry.refreshed_at + Duration::from_secs(59)
        ));
        assert!(!cache_is_fresh(
            &entry,
            entry.refreshed_at + Duration::from_secs(60)
        ));
    }

    #[test]
    fn forced_refresh_bypasses_a_fresh_cache_entry() {
        let entry = CachedQuota {
            value: CodexQuota::Available {
                remaining_percent: 80,
            },
            refreshed_at: Instant::now(),
        };
        let now = entry.refreshed_at + Duration::from_secs(1);

        assert!(should_use_cache(&entry, now, false));
        assert!(!should_use_cache(&entry, now, true));
    }

    #[test]
    fn prefers_the_managed_standalone_codex_runtime() {
        assert_eq!(
            select_codex_executable(Some(Path::new("/Users/tester")), true),
            PathBuf::from("/Users/tester").join(STANDALONE_CODEX_PATH)
        );
    }

    #[test]
    fn falls_back_to_path_codex_when_standalone_is_unavailable() {
        assert_eq!(
            select_codex_executable(Some(Path::new("/Users/tester")), false),
            PathBuf::from("codex")
        );
        assert_eq!(select_codex_executable(None, true), PathBuf::from("codex"));
    }
}
