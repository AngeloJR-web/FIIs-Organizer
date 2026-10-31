// Evita que uma janela de terminal abra junto com o app no Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cofre;

use cofre::{Chave, Formato};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

// A chave só existe na memória, depois que a pessoa digita a senha.
struct Sessao(Mutex<Option<Chave>>);

// LÓGICA ATUALIZADA: Salva o banco de dados na pasta do sistema do usuário
fn obter_caminho_arquivo() -> PathBuf {
    // Tenta pegar a pasta AppData (Windows) ou ~/.config (Mac/Linux)
    let mut path = dirs::data_dir().unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    // Cria uma subpasta exclusiva para o nosso software
    path.push("FII_Tracker");

    // Garante que a pasta exista (cria automaticamente se for a primeira vez)
    fs::create_dir_all(&path).ok();

    // Define o nome do arquivo final
    path.push("carteira_criptografada.dat");
    path
}

fn ler_arquivo() -> Result<Option<String>, String> {
    let path = obter_caminho_arquivo();
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Erro de leitura no HD: {}", e))
}

// Grava em um arquivo temporário antes de trocar, para uma queda de energia não destruir a carteira.
fn gravar_arquivo(conteudo: &str) -> Result<(), String> {
    let path = obter_caminho_arquivo();
    let temporario = path.with_extension("tmp");
    fs::write(&temporario, conteudo).map_err(|e| format!("Erro ao gravar arquivo no HD: {}", e))?;
    fs::rename(&temporario, &path).map_err(|e| format!("Erro ao gravar arquivo no HD: {}", e))
}

#[tauri::command]
fn estado_cofre(sessao: State<Sessao>) -> Result<String, String> {
    if sessao.0.lock().unwrap().is_some() {
        return Ok("aberto".to_string());
    }
    let estado = match ler_arquivo()? {
        None => "novo",
        Some(conteudo) => match cofre::detectar(&conteudo)? {
            Formato::Legado => "legado",
            Formato::Protegido => "protegido",
        },
    };
    Ok(estado.to_string())
}

// Cria a senha do cofre. Uma carteira antiga é regravada no formato novo, com os mesmos dados.
#[tauri::command(async)]
fn criar_senha(senha: String, sessao: State<'_, Sessao>) -> Result<(), String> {
    let chave = cofre::nova_chave(&senha)?;
    let dados = match ler_arquivo()? {
        None => "[]".to_string(),
        Some(conteudo) => match cofre::detectar(&conteudo)? {
            Formato::Legado => cofre::decifrar_legado(&conteudo)?,
            Formato::Protegido => return Err("Este cofre já tem uma senha.".to_string()),
        },
    };
    gravar_arquivo(&cofre::cifrar(&chave, &dados)?)?;
    *sessao.0.lock().unwrap() = Some(chave);
    Ok(())
}

#[tauri::command(async)]
fn desbloquear(senha: String, sessao: State<'_, Sessao>) -> Result<(), String> {
    let conteudo = ler_arquivo()?.ok_or_else(|| "Este cofre ainda não foi criado.".to_string())?;
    let (chave, _) = cofre::abrir(&senha, &conteudo)?;
    *sessao.0.lock().unwrap() = Some(chave);
    Ok(())
}

#[tauri::command]
fn salvar_carteira(dados: String, sessao: State<Sessao>) -> Result<String, String> {
    let guarda = sessao.0.lock().unwrap();
    let chave = guarda.as_ref().ok_or_else(|| "O cofre está bloqueado.".to_string())?;
    gravar_arquivo(&cofre::cifrar(chave, &dados)?)?;
    Ok("Carteira protegida e salva no cofre!".to_string())
}

#[tauri::command]
fn carregar_carteira(sessao: State<Sessao>) -> Result<String, String> {
    let guarda = sessao.0.lock().unwrap();
    let chave = guarda.as_ref().ok_or_else(|| "O cofre está bloqueado.".to_string())?;
    match ler_arquivo()? {
        None => Ok("[]".to_string()),
        Some(conteudo) => cofre::decifrar(chave, &conteudo),
    }
}

fn main() {
    tauri::Builder::default()
        .manage(Sessao(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            estado_cofre,
            criar_senha,
            desbloquear,
            salvar_carteira,
            carregar_carteira
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao inicializar a ponte do Tauri");
}
