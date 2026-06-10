// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "-v" || a == "--version") {
        println!("llm-wiki v{}", env!("CARGO_PKG_VERSION"));
        return;
    }

    if args.iter().any(|a| a == "-h" || a == "--help") {
        println!("llm-wiki v{}", env!("CARGO_PKG_VERSION"));
        println!("A personal knowledge base for LLM concepts.");
        println!();
        println!("Usage: llm-wiki.exe [OPTIONS]");
        println!();
        println!("Options:");
        println!("  -v, --version   Print version");
        println!("  -h, --help      Print help");
        return;
    }

    llm_wiki_lib::run();
}
