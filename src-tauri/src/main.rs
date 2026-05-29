// Evita que uma janela de terminal abra junto com o app no Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::PathBuf;

// A nossa Chave Mestra de 256 bits (32 bytes). 
const CHAVE_SECRETA: &[u8; 32] = b"FII_Tracker_SuperSecretKey2026!!";

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

#[tauri::command]
fn salvar_carteira(dados: String) -> Result<String, String> {
    let key = Key::<Aes256Gcm>::from_slice(CHAVE_SECRETA);
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng); 
    
    match cipher.encrypt(&nonce, dados.as_bytes()) {
        Ok(texto_cifrado) => {
            let mut dados_finais = nonce.to_vec();
            dados_finais.extend_from_slice(&texto_cifrado);
            
            let b64_encoded = general_purpose::STANDARD.encode(&dados_finais);
            let path = obter_caminho_arquivo();
            
            match fs::write(&path, b64_encoded) {
                Ok(_) => Ok("Carteira protegida e salva no cofre!".to_string()),
                Err(e) => Err(format!("Erro ao gravar arquivo no HD: {}", e))
            }
        },
        Err(e) => Err(format!("Erro ao encriptar os dados: {:?}", e))
    }
}

#[tauri::command]
fn carregar_carteira() -> Result<String, String> {
    let path = obter_caminho_arquivo();
    
    if !path.exists() {
        return Ok("[]".to_string());
    }

    match fs::read_to_string(&path) {
        Ok(b64_encoded) => {
            match general_purpose::STANDARD.decode(&b64_encoded) {
                Ok(dados_encriptados) => {
                    if dados_encriptados.len() < 12 {
                        return Err("Arquivo corrompido ou inválido.".to_string());
                    }
                    
                    let key = Key::<Aes256Gcm>::from_slice(CHAVE_SECRETA);
                    let cipher = Aes256Gcm::new(key);
                    
                    let nonce = Nonce::from_slice(&dados_encriptados[0..12]);
                    let texto_cifrado = &dados_encriptados[12..];
                    
                    match cipher.decrypt(nonce, texto_cifrado) {
                        Ok(texto_puro) => {
                            Ok(String::from_utf8(texto_puro).unwrap_or_else(|_| "[]".to_string()))
                        },
                        Err(_) => Err("Falha ao quebrar a criptografia.".to_string())
                    }
                },
                Err(_) => Err("Erro ao decodificar Base64.".to_string())
            }
        },
        Err(e) => Err(format!("Erro de leitura no HD: {}", e))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init()) 
        .invoke_handler(tauri::generate_handler![salvar_carteira, carregar_carteira])
        .run(tauri::generate_context!())
        .expect("Erro ao inicializar a ponte do Tauri");
}