//! Cofre da carteira: os dados são cifrados com uma chave derivada da senha de quem usa o app.

use aes_gcm::{
    aead::{rand_core::RngCore, Aead, AeadCore, KeyInit, OsRng, Payload},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose, Engine as _};
use zeroize::Zeroizing;

/// Identifica o formato atual do arquivo: MARCA + salt + nonce + texto cifrado.
const MARCA: &[u8; 4] = b"FII2";
const TAMANHO_SALT: usize = 16;
const TAMANHO_CABECALHO: usize = MARCA.len() + TAMANHO_SALT;
const TAMANHO_NONCE: usize = 12;
const TAMANHO_TAG: usize = 16;

pub const SENHA_MINIMA: usize = 8;

// Até a versão 1.0.1 a carteira usava esta chave fixa, que continua no histórico público do Git.
// Ela só serve para ler arquivos antigos na migração: nada novo é gravado nesse formato.
const CHAVE_LEGADA: &[u8; 32] = b"FII_Tracker_SuperSecretKey2026!!";

#[derive(Debug, PartialEq)]
pub enum Formato {
    Legado,
    Protegido,
}

pub struct Chave {
    chave: Zeroizing<[u8; 32]>,
    salt: [u8; TAMANHO_SALT],
}

fn decodificar(conteudo: &str) -> Result<Vec<u8>, String> {
    general_purpose::STANDARD
        .decode(conteudo.trim())
        .map_err(|_| "O arquivo da carteira está corrompido.".to_string())
}

pub fn detectar(conteudo: &str) -> Result<Formato, String> {
    let bytes = decodificar(conteudo)?;
    if bytes.starts_with(MARCA) && bytes.len() >= TAMANHO_CABECALHO + TAMANHO_NONCE + TAMANHO_TAG {
        Ok(Formato::Protegido)
    } else if bytes.len() >= TAMANHO_NONCE + TAMANHO_TAG {
        Ok(Formato::Legado)
    } else {
        Err("O arquivo da carteira está corrompido.".to_string())
    }
}

fn derivar(senha: &str, salt: [u8; TAMANHO_SALT]) -> Result<Chave, String> {
    let parametros = Params::new(64 * 1024, 3, 4, Some(32))
        .map_err(|_| "Não foi possível preparar a chave.".to_string())?;
    let mut chave = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, parametros)
        .hash_password_into(senha.as_bytes(), &salt, chave.as_mut())
        .map_err(|_| "Não foi possível preparar a chave.".to_string())?;
    Ok(Chave { chave, salt })
}

pub fn nova_chave(senha: &str) -> Result<Chave, String> {
    if senha.chars().count() < SENHA_MINIMA {
        return Err(format!("A senha precisa ter pelo menos {SENHA_MINIMA} caracteres."));
    }
    let mut salt = [0u8; TAMANHO_SALT];
    OsRng.fill_bytes(&mut salt);
    derivar(senha, salt)
}

fn cifra_de(chave: &[u8; 32]) -> Aes256Gcm {
    Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(chave))
}

pub fn cifrar(chave: &Chave, dados: &str) -> Result<String, String> {
    let mut cabecalho = MARCA.to_vec();
    cabecalho.extend_from_slice(&chave.salt);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let cifrado = cifra_de(&chave.chave)
        .encrypt(&nonce, Payload { msg: dados.as_bytes(), aad: &cabecalho })
        .map_err(|_| "Não foi possível cifrar a carteira.".to_string())?;

    let mut saida = cabecalho;
    saida.extend_from_slice(&nonce);
    saida.extend_from_slice(&cifrado);
    Ok(general_purpose::STANDARD.encode(saida))
}

pub fn decifrar(chave: &Chave, conteudo: &str) -> Result<String, String> {
    if detectar(conteudo)? != Formato::Protegido {
        return Err("O arquivo da carteira está corrompido.".to_string());
    }
    let bytes = decodificar(conteudo)?;
    let (cabecalho, resto) = bytes.split_at(TAMANHO_CABECALHO);
    let (nonce, cifrado) = resto.split_at(TAMANHO_NONCE);
    let puro = cifra_de(&chave.chave)
        .decrypt(Nonce::from_slice(nonce), Payload { msg: cifrado, aad: cabecalho })
        .map_err(|_| "Senha incorreta.".to_string())?;
    String::from_utf8(puro).map_err(|_| "O arquivo da carteira está corrompido.".to_string())
}

/// Abre um arquivo protegido e devolve a chave da sessão junto com os dados.
pub fn abrir(senha: &str, conteudo: &str) -> Result<(Chave, String), String> {
    if detectar(conteudo)? != Formato::Protegido {
        return Err("Este cofre ainda não tem senha.".to_string());
    }
    let bytes = decodificar(conteudo)?;
    let mut salt = [0u8; TAMANHO_SALT];
    salt.copy_from_slice(&bytes[MARCA.len()..TAMANHO_CABECALHO]);
    let chave = derivar(senha, salt)?;
    let dados = decifrar(&chave, conteudo)?;
    Ok((chave, dados))
}

pub fn decifrar_legado(conteudo: &str) -> Result<String, String> {
    let bytes = decodificar(conteudo)?;
    if bytes.len() < TAMANHO_NONCE + TAMANHO_TAG {
        return Err("O arquivo da carteira está corrompido.".to_string());
    }
    let (nonce, cifrado) = bytes.split_at(TAMANHO_NONCE);
    let puro = cifra_de(CHAVE_LEGADA)
        .decrypt(Nonce::from_slice(nonce), cifrado)
        .map_err(|_| "Não foi possível ler a carteira antiga.".to_string())?;
    String::from_utf8(puro).map_err(|_| "O arquivo da carteira está corrompido.".to_string())
}

#[cfg(test)]
mod testes {
    use super::*;

    const SENHA: &str = "senha de teste";
    const DADOS: &str = r#"{"historico":[{"ticker":"MXRF11","cotas":10}]}"#;

    fn arquivo_legado(dados: &str) -> String {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let cifrado = cifra_de(CHAVE_LEGADA).encrypt(&nonce, dados.as_bytes()).unwrap();
        let mut saida = nonce.to_vec();
        saida.extend_from_slice(&cifrado);
        general_purpose::STANDARD.encode(saida)
    }

    #[test]
    fn abre_com_a_senha_certa() {
        let chave = nova_chave(SENHA).unwrap();
        let arquivo = cifrar(&chave, DADOS).unwrap();
        let (_, dados) = abrir(SENHA, &arquivo).unwrap();
        assert_eq!(dados, DADOS);
    }

    #[test]
    fn recusa_a_senha_errada() {
        let chave = nova_chave(SENHA).unwrap();
        let arquivo = cifrar(&chave, DADOS).unwrap();
        assert_eq!(abrir("outra senha", &arquivo).err().unwrap(), "Senha incorreta.");
    }

    #[test]
    fn a_chave_antiga_nao_abre_o_formato_novo() {
        let chave = nova_chave(SENHA).unwrap();
        let arquivo = cifrar(&chave, DADOS).unwrap();
        assert!(decifrar_legado(&arquivo).is_err());
    }

    #[test]
    fn detecta_alteracao_no_cabecalho() {
        let chave = nova_chave(SENHA).unwrap();
        let mut bytes = decodificar(&cifrar(&chave, DADOS).unwrap()).unwrap();
        bytes[MARCA.len()] ^= 1;
        let alterado = general_purpose::STANDARD.encode(bytes);
        assert!(abrir(SENHA, &alterado).is_err());
    }

    #[test]
    fn cada_gravacao_usa_um_nonce_novo() {
        let chave = nova_chave(SENHA).unwrap();
        assert_ne!(cifrar(&chave, DADOS).unwrap(), cifrar(&chave, DADOS).unwrap());
    }

    #[test]
    fn migra_a_carteira_antiga_sem_perder_dados() {
        let antigo = arquivo_legado(DADOS);
        assert_eq!(detectar(&antigo).unwrap(), Formato::Legado);

        let dados = decifrar_legado(&antigo).unwrap();
        let chave = nova_chave(SENHA).unwrap();
        let novo = cifrar(&chave, &dados).unwrap();

        assert_eq!(detectar(&novo).unwrap(), Formato::Protegido);
        assert_eq!(abrir(SENHA, &novo).unwrap().1, DADOS);
    }

    #[test]
    fn recusa_senha_curta() {
        assert!(nova_chave("curta").is_err());
    }

    #[test]
    fn recusa_arquivo_corrompido() {
        assert!(detectar("isso não é base64!").is_err());
        assert!(detectar("YWJj").is_err());
    }
}
