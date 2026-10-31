# 📊 FII Tracker (Desktop App)

Um software desktop nativo, seguro e de alta fidelidade para gestão de Fundos Investimento Imobiliários (FIIs), focado em performance e privacidade.

## 🚀 Tecnologias Utilizadas
* **Frontend:** HTML5, CSS3 (Neon UI/Dark Theme) e JavaScript (Vanilla).
* **Backend:** Rust 🦀.
* **Framework:** Tauri (Desktop leve e ultra-rápido).
* **Segurança:** Criptografia AES-256-GCM com chave derivada da sua senha por Argon2id.
* **Integração:** Consumo da Brapi API para cotações da B3 em tempo real.
* **Data Viz:** Chart.js para dashboards dinâmicos (Ativos e Segmentos).

## ✨ Funcionalidades
- **Dashboard Analítico:** Tabelas com cálculo automático de Lucro/Prejuízo, Preço Médio e Porcentagem de Posição da carteira.
- **Histórico de Operações (Livro-Caixa):** Lançamento de compras e vendas que recalcula todo o portfólio dinamicamente sem "Layout Shift".
- **Gestão de Dividendos:** Área exclusiva para lançamento de proventos, calculando automaticamente o Dividend Yield (D.Y) de cada operação.
- **Background Auto-Update:** O motor do app monitora os preços da B3 em segundo plano (60s) e atualiza os valores na interface suavemente, sem piscar a tela.
- **Banco de Dados Criptografado (Offline-First):** Seus dados financeiros não ficam na nuvem nem no `localStorage`. Eles são salvos diretamente no seu sistema operacional sob uma camada militar de criptografia em Rust.

## 🔐 Senha do Cofre
Na primeira vez que abrir o app, você cria uma senha. A chave que protege a carteira é gerada a partir dela e só fica na memória enquanto o app está aberto.

Carteiras salvas por versões anteriores são migradas para o novo formato quando você cria a senha, sem perder dados.

**Importante:** não existe como recuperar a senha. Sem ela, a carteira não pode ser aberta.

## 📦 Como Instalar (Usuário Final)
Vá até a aba **Releases** deste repositório, baixe o arquivo `.exe` e instale no seu Windows.

## 🛠️ Como Rodar (Desenvolvedores)
1. Clone este repositório.
2. Certifique-se de ter o **Node.js** e o **Rust** instalados na sua máquina.
3. Instale as dependências do frontend com `npm install`.
4. Copie `src/config.example.js` para `src/config.js` e coloque nele seu token da [Brapi](https://brapi.dev). Esse arquivo fica de fora do Git.
5. Rode o comando `npm run tauri dev`.

---
*Desenvolvido com foco na construção de arquiteturas sólidas, integrando a segurança e performance do Rust com a flexibilidade do ecossistema Web.*