use serde::Serialize;

const KEYCHAIN_SERVICE: &str = "com.openhire.a2a.deploymentpet.jenkins";
const USERNAME_ACCOUNT: &str = "username";
const TOKEN_ACCOUNT: &str = "api-token";

#[derive(Clone)]
pub struct JenkinsCredentials {
    pub username: String,
    pub token: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub configured: bool,
    pub username: Option<String>,
}

pub struct CredentialStore;

impl CredentialStore {
    pub fn load() -> Result<Option<JenkinsCredentials>, String> {
        let username = Self::entry(USERNAME_ACCOUNT)?
            .get_password()
            .ok()
            .filter(|value| !value.trim().is_empty());
        let token = Self::entry(TOKEN_ACCOUNT)?
            .get_password()
            .ok()
            .filter(|value| !value.trim().is_empty());

        Ok(match (username, token) {
            (Some(username), Some(token)) => Some(JenkinsCredentials { username, token }),
            _ => None,
        })
    }

    pub fn status() -> Result<CredentialStatus, String> {
        let credentials = Self::load()?;
        Ok(CredentialStatus {
            configured: credentials.is_some(),
            username: credentials.map(|value| value.username),
        })
    }

    pub fn save(username: String, token: String) -> Result<CredentialStatus, String> {
        let username = username.trim();
        let token = token.trim();
        if username.is_empty() || token.is_empty() {
            return Err("Jenkins 用户名和 API Token 不能为空".to_owned());
        }

        Self::entry(USERNAME_ACCOUNT)?
            .set_password(username)
            .map_err(|_| "无法把 Jenkins 用户名写入 macOS Keychain".to_owned())?;
        if Self::entry(TOKEN_ACCOUNT)?.set_password(token).is_err() {
            let _ = Self::entry(USERNAME_ACCOUNT)?.delete_credential();
            return Err("无法把 Jenkins Token 写入 macOS Keychain".to_owned());
        }

        Ok(CredentialStatus {
            configured: true,
            username: Some(username.to_owned()),
        })
    }

    pub fn clear() -> Result<CredentialStatus, String> {
        for account in [USERNAME_ACCOUNT, TOKEN_ACCOUNT] {
            if let Ok(entry) = Self::entry(account) {
                let _ = entry.delete_credential();
            }
        }

        Ok(CredentialStatus {
            configured: false,
            username: None,
        })
    }

    fn entry(account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYCHAIN_SERVICE, account)
            .map_err(|_| "无法访问 macOS Keychain".to_owned())
    }
}
