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
        let payload: Value = response.json().await?;
        let Some(result) = payload
            .get("data")
            .and_then(|data| data.get("favoriteQuestionList"))
        else {
            break;
        };
        if let Some(items) = result.get("questions").and_then(Value::as_array) {
            questions.extend(items.iter().filter_map(|question| {
                Some(json!({
                    "title": question.get("title")?.as_str()?,
                    "slug": question.get("titleSlug")?.as_str()?,
                }))
            }));
        }
        if result.get("hasMore").and_then(Value::as_bool) != Some(true) {
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
    let payload: Value = response.json().await?;
    let data = payload.get("data").cloned().unwrap_or(Value::Null);
    let mut pending = Vec::new();
    for (field, writable) in [
        ("myCreatedFavoriteList", true),
        ("myCollectedFavoriteList", false),
    ] {
        let items = data
            .get(field)
            .and_then(|list| list.get("favorites"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
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
    let payload: Value = response.json().await?;
    let result = payload
        .get("data")
        .and_then(|data| data.get(operation))
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
