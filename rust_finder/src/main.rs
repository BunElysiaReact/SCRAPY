// rust_finder/src/main.rs
// Fast HTML element extractor
// Usage: ./rust_finder --selector "div.price" --file html_123.json --limit 100

use scraper::{Html, Selector};
use serde::Serialize;
use serde_json::Value;
use std::env;
use std::fs;

// Platform-specific path handling
#[cfg(target_os = "windows")]
fn normalize_path(path: &str) -> String {
    // Convert forward slashes to backslashes on Windows
    path.replace('/', "\\")
}

#[cfg(not(target_os = "windows"))]
fn normalize_path(path: &str) -> String {
    // Keep as-is on Linux/Mac
    path.to_string()
}

#[derive(Serialize)]
struct Match {
    tag:        String,
    text:       String,
    html:       String,
    attrs:      Vec<(String, String)>,
}

fn main() {
    let args: Vec<String> = env::args().collect();

    let mut selector_str = "div".to_string();
    let mut file_path    = String::new();
    let mut limit: usize = 100;
    let mut raw_html     = String::new();

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--selector" => { 
                i += 1; 
                if i < args.len() {
                    selector_str = args[i].clone();
                }
            }
            "--file"     => { 
                i += 1; 
                if i < args.len() {
                    // Normalize path for current platform
                    file_path = normalize_path(&args[i]);
                }
            }
            "--limit"    => { 
                i += 1; 
                if i < args.len() {
                    limit = args[i].parse().unwrap_or(100);
                }
            }
            "--html"     => { 
                i += 1; 
                if i < args.len() {
                    raw_html = args[i].clone();
                }
            }
            _ => {}
        }
        i += 1;
    }

    // Get HTML either from --html arg or --file
    let html = if !raw_html.is_empty() {
        raw_html
    } else if !file_path.is_empty() {
        // File is a JSON wrapper produced by the scraper host
        match fs::read_to_string(&file_path) {
            Ok(contents) => {
                // Try to parse as JSON and extract html field
                if let Ok(val) = serde_json::from_str::<Value>(&contents) {
                    // Try data.html
                    if let Some(h) = val.pointer("/data/html").and_then(|v| v.as_str()) {
                        h.to_string()
                    }
                    // Try body
                    else if let Some(h) = val.get("body").and_then(|v| v.as_str()) {
                        h.to_string()
                    }
                    // Maybe it's raw HTML in the file
                    else {
                        contents
                    }
                } else {
                    // Raw HTML file
                    contents
                }
            }
            Err(e) => {
                eprintln!("Error reading file: {}", e);
                let err = serde_json::json!([{"error": format!("Cannot read file: {}", e)}]);
                println!("{}", err);
                return;
            }
        }
    } else {
        eprintln!("No input. Use --file <path> or --html <html_string>");
        println!("[]");
        return;
    };

    // Parse selector
    let selector = match Selector::parse(&selector_str) {
        Ok(s)  => s,
        Err(e) => {
            let err = serde_json::json!([{"error": format!("Invalid selector '{}': {:?}", selector_str, e)}]);
            println!("{}", err);
            return;
        }
    };

    // Parse HTML
    let document = Html::parse_document(&html);
    let mut matches: Vec<Match> = Vec::new();

    for element in document.select(&selector).take(limit) {
        let tag   = element.value().name().to_string();
        let text  = element.text().collect::<Vec<_>>().join(" ").trim().to_string();
        let html  = element.html();
        let attrs = element.value().attrs()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<Vec<_>>();

        matches.push(Match { tag, text, html, attrs });
    }

    println!("{}", serde_json::to_string(&matches).unwrap_or_else(|_| "[]".to_string()));
}