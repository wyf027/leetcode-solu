use clap::{Parser, Subcommand};
use leetcode_cli::{Result, plugins::LeetCode};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::Semaphore;

const MY_FAVORITES_QUERY: &str = r#"
query myFavoriteList {
  myCreatedFavoriteList {
    favorites { name slug favoriteType }
  }
  myCollectedFavoriteList {
    favorites { name slug favoriteType }
  }
}
"#;

const FAVORITE_QUESTIONS_QUERY: &str = r#"
query favoriteQuestionList($favoriteSlug: String!, $limit: Int, $skip: Int, $version: String) {
  favoriteQuestionList(
    favoriteSlug: $favoriteSlug
    limit: $limit
    skip: $skip
    version: $version
  ) {
    questions { title titleSlug }
    hasMore
  }
}
"#;

const ADD_MUTATION: &str = r#"
mutation addQuestionToFavoriteV2($favoriteSlug: String!, $questionSlug: String!) {
  addQuestionToFavoriteV2(favoriteSlug: $favoriteSlug, questionSlug: $questionSlug) {
    ok
    error
  }
}
"#;

const REMOVE_MUTATION: &str = r#"
mutation removeQuestionFromFavoriteV2($favoriteSlug: String!, $questionSlug: String!) {
  removeQuestionFromFavoriteV2(favoriteSlug: $favoriteSlug, questionSlug: $questionSlug) {
    ok
    error
  }
}
"#;

#[derive(Parser)]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Folders,
    Add { folder: String, question: String },
    Remove { folder: String, question: String },
}

async fn graphql_data(response: reqwest::Response) -> Result<Value> {
    if matches!(response.status().as_u16(), 401 | 403) {
        return Err(anyhow::anyhow!("Authentication required.").into());
    }
    let payload: Value = response.error_for_status()?.json().await?;
    if let Some(errors) = payload.get("errors").filter(|errors| !errors.is_null()) {
        if errors.as_array().map_or(true, |items| !items.is_empty()) {
            let text = errors.to_string().to_lowercase();
            let auth = [
                "unauthenticated",
                "unauthorized",
                "not logged in",
                "not authenticated",
                "authentication required",
                "login required",
                "please log in",
                "请先登录",
                "未登录",
            ]
            .iter()
            .any(|marker| text.contains(marker));
            return Err(anyhow::anyhow!(if auth {
                "Authentication required."
            } else {
                "Favorite GraphQL request failed."
            })
            .into());
        }
    }
    payload
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("Favorite response data is missing.").into())
}

async fn favorite_questions(client: &LeetCode, favorite_slug: &str) -> Result<Vec<Value>> {
    let mut questions = Vec::new();
    let mut skip = 0;
    loop {
        let variables = json!({
            "favoriteSlug": favorite_slug,
            "limit": 100,
            "skip": skip,
            "version": "v3",
        })
        .to_string();
        let response = client
            .clone()
            .graphql(
                "favoriteQuestionList",
                FAVORITE_QUESTIONS_QUERY.to_string(),
                variables,
            )
            .await?;
        let data = graphql_data(response).await?;
        let result = data
            .get("favoriteQuestionList")
            .ok_or_else(|| anyhow::anyhow!("Favorite question list is missing."))?;
        let items = result
            .get("questions")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow::anyhow!("Favorite questions are missing."))?;
        questions.extend(items.iter().filter_map(|question| {
            Some(json!({
                "title": question.get("title")?.as_str()?,
                "slug": question.get("titleSlug")?.as_str()?,
            }))
        }));
        let has_more = result
            .get("hasMore")
            .and_then(Value::as_bool)
            .ok_or_else(|| anyhow::anyhow!("Favorite pagination is missing."))?;
        if !has_more {
            break;
        }
        skip += 100;
    }
    Ok(questions)
}

async fn favorite_folders(client: &LeetCode) -> Result<Vec<Value>> {
    let response = client
        .clone()
        .graphql(
            "myFavoriteList",
            MY_FAVORITES_QUERY.to_string(),
            "{}".to_string(),
        )
        .await?;
    let data = graphql_data(response).await?;
    let mut pending = Vec::new();
    for (field, writable) in [
        ("myCreatedFavoriteList", true),
        ("myCollectedFavoriteList", false),
    ] {
        let items = data
            .get(field)
            .and_then(|list| list.get("favorites"))
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow::anyhow!("Favorite folder list is missing."))?;
        for folder in items {
            let Some(slug) = folder.get("slug").and_then(Value::as_str) else {
                continue;
            };
            let Some(name) = folder.get("name").and_then(Value::as_str) else {
                continue;
            };
            pending.push((slug.to_string(), name.to_string(), writable));
        }
    }
    let semaphore = Arc::new(Semaphore::new(8));
    let mut handles = Vec::new();
    for (slug, name, writable) in pending {
        let request_client = client.clone();
        let request_semaphore = semaphore.clone();
        handles.push(tokio::spawn(async move {
            let _permit = request_semaphore
                .acquire_owned()
                .await
                .map_err(|error| anyhow::anyhow!(error))?;
            let questions = favorite_questions(&request_client, &slug).await?;
            Ok::<Value, leetcode_cli::Error>(json!({
                "slug": slug,
                "name": name,
                "writable": writable,
                "questions": questions,
            }))
        }));
    }
    let mut folders = Vec::new();
    for handle in handles {
        folders.push(handle.await.map_err(|error| anyhow::anyhow!(error))??);
    }
    Ok(folders)
}

async fn mutate(
    operation: &'static str,
    query: &str,
    folder: String,
    question: String,
) -> Result<()> {
    let variables = json!({ "favoriteSlug": folder, "questionSlug": question }).to_string();
    let response = LeetCode::new()?
        .graphql(operation, query.to_string(), variables)
        .await?;
    let status = response.status().as_u16();
    let data = graphql_data(response).await?;
    let result = data
        .get(operation)
        .cloned()
        .unwrap_or_else(|| json!({ "ok": false, "error": "Favorite operation failed." }));
    println!("{}", json!({ "status": status, "result": result }));
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    match Args::parse().command {
        Command::Folders => {
            let client = LeetCode::new()?;
            println!(
                "{}",
                json!({ "status": 200, "folders": favorite_folders(&client).await? })
            );
            Ok(())
        }
        Command::Add { folder, question } => {
            mutate("addQuestionToFavoriteV2", ADD_MUTATION, folder, question).await
        }
        Command::Remove { folder, question } => {
            mutate(
                "removeQuestionFromFavoriteV2",
                REMOVE_MUTATION,
                folder,
                question,
            )
            .await
        }
    }
}
