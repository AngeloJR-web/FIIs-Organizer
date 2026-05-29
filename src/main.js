const { invoke } = window.__TAURI__.core;
const TOKEN_BRAPI = 'dXRGpCoYc2j8vPJ2U5rdEC';

let dadosApp = {
  carteira: [],   
  historico: [],     
  dividendos: []     
};

let graficoCarteiraAtivos = null;
let graficoCarteiraSegmentos = null;

const dicionarioFIIs = {
  "MXRF11": "Papel", "HGLG11": "Tijolo", "XPLG11": "Tijolo",
  "KNCR11": "Papel", "KNIP11": "Papel", "BTLG11": "Tijolo",
  "VILG11": "Tijolo", "IRDM11": "Papel", "CPTS11": "Papel",
  "VGIP11": "Papel", "RECR11": "Papel", "HGRU11": "Tijolo",
  "VISC11": "Tijolo", "XPML11": "Tijolo", "HSML11": "Tijolo",
  "RZTR11": "Fiagro", "VGIA11": "Fiagro", "SNAG11": "Fiagro", 
  "GARE11": "Tijolo", "RURA11": "Fiagro", "GGRC11": "Tijolo",
  "BBIG11": "Papel", "CPSH11": "Papel", "RZAG11": "Fiagro",
  "MANA11": "Fiagro", "BTC11": "Papel", "VGHF11": "Papel",
  "CACR11": "Papel", "BTHF11": "Hibrido", "SNEL11": "Hibrido",
  "SNFZ11": "Fiagro", "ALZR11": "Hibrido", "TRXF11": "Tijolo"
};

function gerarIDUnico() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function dataDeHojeSegura() {
  return new Date().toISOString().split('T')[0];
}

function formatarMoeda(valor) {
  const num = Number(valor);
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- NAVEGAÇÃO ENTRE ABAS ---
const btnTabDash = document.getElementById("btn-tab-dash");
const btnTabHist = document.getElementById("btn-tab-hist");
const btnTabDiv  = document.getElementById("btn-tab-div");
const viewDash = document.getElementById("view-dashboard");
const viewHist = document.getElementById("view-history");
const viewDiv  = document.getElementById("view-dividends");

function esconderTodasAbas() {
  btnTabDash.classList.remove("active");
  btnTabHist.classList.remove("active");
  btnTabDiv.classList.remove("active");
  viewDash.classList.add("hidden");
  viewHist.classList.add("hidden");
  viewDiv.classList.add("hidden");
}

btnTabDash.addEventListener("click", () => { esconderTodasAbas(); btnTabDash.classList.add("active"); viewDash.classList.remove("hidden"); });
btnTabHist.addEventListener("click", () => { esconderTodasAbas(); btnTabHist.classList.add("active"); viewHist.classList.remove("hidden"); renderizarTabelaOperacoes(); });
btnTabDiv.addEventListener("click", () => { esconderTodasAbas(); btnTabDiv.classList.add("active"); viewDiv.classList.remove("hidden"); renderizarTabelaDividendos(); });

// --- SISTEMA DE NOTIFICAÇÕES ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.classList.add('toast', type);
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

// --- PERSISTÊNCIA ---
async function salvarDados(silencioso = false) {
  try {
    const jsonStr = JSON.stringify(dadosApp);
    await invoke('salvar_carteira', { dados: jsonStr });
    if (!silencioso) showToast("Livro atualizado no cofre!", "success");
  } catch (error) {
    showToast("Erro ao criptografar dados.", "error");
  }
}

async function carregarDadosDoCofre() {
  try {
    const dadosDescriptografados = await invoke('carregar_carteira');
    const parsed = JSON.parse(dadosDescriptografados);
    
    if (Array.isArray(parsed)) {
      dadosApp.carteira = parsed; dadosApp.historico = []; dadosApp.dividendos = [];
    } else {
      dadosApp = parsed;
      if (!dadosApp.dividendos) dadosApp.dividendos = []; 
    }
    
    dadosApp.historico.forEach(op => { if (!op.id) op.id = gerarIDUnico(); });
    dadosApp.dividendos.forEach(op => { if (!op.id) op.id = gerarIDUnico(); });

    recalcularCarteiraBaseadoNoHistorico(true);
  } catch (error) {
    dadosApp = { carteira: [], historico: [], dividendos: [] }; 
    recalcularCarteiraBaseadoNoHistorico(true);
  }
}

// --- LÓGICA DA CARTEIRA ---
function recalcularCarteiraBaseadoNoHistorico(reconstruirTabelas = true) {
  let resumoTemp = {};

  dadosApp.historico.forEach(op => {
    if (!resumoTemp[op.ticker]) {
      resumoTemp[op.ticker] = {
        ticker: op.ticker, type: dicionarioFIIs[op.ticker] || "Outros",
        shares: 0, totalInvestido: 0, avgPrice: 0, currentPrice: 0
      };
    }
    const fundo = resumoTemp[op.ticker];
    if (op.operacao === "Compra") {
      fundo.shares += op.cotas;
      fundo.totalInvestido += (op.cotas * op.valor);
      fundo.avgPrice = fundo.totalInvestido / fundo.shares;
    } else if (op.operacao === "Venda") {
      fundo.shares -= op.cotas;
      fundo.totalInvestido -= (op.cotas * fundo.avgPrice); 
      if (fundo.shares <= 0) { fundo.shares = 0; fundo.totalInvestido = 0; fundo.avgPrice = 0; }
    }
  });

  const novaCarteira = [];
  for (const ticker in resumoTemp) {
    const fundoResumo = resumoTemp[ticker];
    if (fundoResumo.shares > 0) { 
      const fundoAntigo = dadosApp.carteira.find(f => f.ticker === ticker);
      fundoResumo.currentPrice = fundoAntigo && fundoAntigo.currentPrice ? fundoAntigo.currentPrice : fundoResumo.avgPrice;
      novaCarteira.push(fundoResumo);
    }
  }
  
  dadosApp.carteira = novaCarteira;

  renderizarTabelaDashboard(dadosApp.carteira);
  atualizarPainel(dadosApp.carteira);
  
  if (reconstruirTabelas) {
      renderizarTabelaOperacoes();
      renderizarTabelaDividendos();
  }
}

// --- TABELA 1: DASHBOARD ---
function renderizarTabelaDashboard(fiis) {
  const tbody = document.getElementById("dashboard-tbody");
  const tfoot = document.getElementById("dashboard-tfoot");
  tbody.innerHTML = ""; tfoot.innerHTML = "";

  if (fiis.length === 0) return;

  let totalQtd = 0, somaTotalOriginal = 0, somaTotalHoje = 0;
  let patrimonioTotal = fiis.reduce((acc, fii) => acc + (fii.shares * fii.currentPrice), 0);

  fiis.forEach(fii => {
    const totalOriginal = fii.shares * fii.avgPrice;
    const totalHoje = fii.shares * fii.currentPrice;
    const lucroRS = totalHoje - totalOriginal;
    const lucroPct = totalOriginal > 0 ? (lucroRS / totalOriginal) * 100 : 0;
    const posicaoPct = patrimonioTotal > 0 ? (totalHoje / patrimonioTotal) * 100 : 0;

    totalQtd += fii.shares; somaTotalOriginal += totalOriginal; somaTotalHoje += totalHoje;
    const classeLucro = lucroRS >= 0 ? "bg-green" : "bg-red";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${fii.ticker}</strong></td>
      <td>${fii.type.split(" ")[0].toUpperCase()}</td>
      <td><strong>${fii.shares}</strong></td>
      <td>${formatarMoeda(fii.currentPrice)}</td>
      <td>${formatarMoeda(fii.avgPrice)}</td>
      <td>${formatarMoeda(totalOriginal)}</td>
      <td>${formatarMoeda(totalHoje)}</td>
      <td class="${classeLucro}">${lucroRS > 0 ? '+' : ''}${formatarMoeda(lucroRS)}</td>
      <td class="${classeLucro}">${lucroPct > 0 ? '+' : ''}${lucroPct.toFixed(2).replace('.', ',')}%</td>
      <td>${posicaoPct.toFixed(2).replace('.', ',')}%</td>
    `;
    tbody.appendChild(tr);
  });

  const lucroTotalRS = somaTotalHoje - somaTotalOriginal;
  const lucroTotalPct = somaTotalOriginal > 0 ? (lucroTotalRS / somaTotalOriginal) * 100 : 0;
  const classeLucroTotal = lucroTotalRS >= 0 ? "bg-green" : "bg-red";

  const trFoot = document.createElement("tr");
  trFoot.innerHTML = `
    <th colspan="2">TOTAL</th><th>${totalQtd}</th><th>-</th><th>-</th>
    <th>${formatarMoeda(somaTotalOriginal)}</th><th>${formatarMoeda(somaTotalHoje)}</th>
    <th class="${classeLucroTotal}">${lucroTotalRS > 0 ? '+' : ''}${formatarMoeda(lucroTotalRS)}</th>
    <th class="${classeLucroTotal}">${lucroTotalPct > 0 ? '+' : ''}${lucroTotalPct.toFixed(2).replace('.', ',')}%</th>
    <th>100,00%</th>
  `;
  tfoot.appendChild(trFoot);
}

// --- TABELA 2: OPERAÇÕES ---
function renderizarTabelaOperacoes() {
  const tbody = document.getElementById("history-tbody");
  tbody.innerHTML = "";

  for (let i = dadosApp.historico.length - 1; i >= 0; i--) {
    const op = dadosApp.historico[i];
    const tr = document.createElement("tr");
    const classeTag = op.operacao === "Compra" ? "tag-compra" : "tag-venda";
    const dataFormatada = op.data.split('-').reverse().join('/');

    tr.innerHTML = `
      <td>${dataFormatada}</td><td><strong>${op.ticker}</strong></td>
      <td><span class="tag-op ${classeTag}">${op.operacao}</span></td><td>${op.cotas}</td>
      <td>${formatarMoeda(op.valor)}</td><td>${formatarMoeda(op.cotas * op.valor)}</td>
      <td><button class="btn-delete-hist" title="Apagar Registro">✖</button></td>
    `;

    tr.querySelector('.btn-delete-hist').addEventListener('click', async (e) => {
      if(confirm(`Apagar registro de ${op.operacao} do ${op.ticker}?`)) {
        dadosApp.historico = dadosApp.historico.filter(item => item.id !== op.id); 
        e.target.closest('tr').remove(); 
        recalcularCarteiraBaseadoNoHistorico(false); 
        await salvarDados(true);
      }
    });
    tbody.appendChild(tr);
  }
}

// --- TABELA 3: DIVIDENDOS ---
function renderizarTabelaDividendos() {
  const tbody = document.getElementById("dividends-tbody");
  tbody.innerHTML = "";

  for (let i = dadosApp.dividendos.length - 1; i >= 0; i--) {
    const divi = dadosApp.dividendos[i];
    const tr = document.createElement("tr");
    const dataFormatada = divi.data.split('-').reverse().join('/');
    const dyFormatado = divi.dy ? divi.dy.toFixed(2).replace('.', ',') + '%' : '0,00%';

    tr.innerHTML = `
      <td>${dataFormatada}</td><td><strong>${divi.ticker}</strong></td>
      <td class="text-green"><strong>${formatarMoeda(divi.totalRecebido)}</strong></td>
      <td>${divi.cotasBase}</td><td>${formatarMoeda(divi.dividendoPorCota)}</td>
      <td>${formatarMoeda(divi.valorCota)}</td>
      <td style="color: var(--accent-orange); font-weight: bold;">${dyFormatado}</td>
      <td><button class="btn-delete-hist" title="Apagar Registro">✖</button></td>
    `;

    tr.querySelector('.btn-delete-hist').addEventListener('click', async (e) => {
      if(confirm(`Apagar este dividendo de ${divi.ticker}?`)) {
        dadosApp.dividendos = dadosApp.dividendos.filter(item => item.id !== divi.id);
        e.target.closest('tr').remove(); 
        recalcularCarteiraBaseadoNoHistorico(false); 
        await salvarDados(true);
      }
    });
    tbody.appendChild(tr);
  }
}

// --- ATUALIZAÇÕES DOS GRÁFICOS ---
function atualizarGraficos(fiis) {
  if (typeof Chart === 'undefined') return;

  const ctxAtivos = document.getElementById('portfolioChartAtivos').getContext('2d');
  const ctxSegmentos = document.getElementById('portfolioChartSegmentos').getContext('2d');
  
  if (fiis.length === 0) {
    if (graficoCarteiraAtivos) { graficoCarteiraAtivos.destroy(); graficoCarteiraAtivos = null; }
    if (graficoCarteiraSegmentos) { graficoCarteiraSegmentos.destroy(); graficoCarteiraSegmentos = null; }
    return;
  }

  const paletaCores = ['#00e5ff', '#00ff88', '#b026ff', '#ff9d00', '#ff4444', '#ff00d4', '#e1ff00', '#ff5900', '#0044ff'];
  const labelsAtivos = fiis.map(f => f.ticker);
  const dataAtivos = fiis.map(f => f.shares * f.currentPrice);

  const distribuicaoSeg = {};
  fiis.forEach(fii => {
    const tipo = fii.type.split(" ")[0].toUpperCase();
    distribuicaoSeg[tipo] = (distribuicaoSeg[tipo] || 0) + (fii.shares * fii.currentPrice);
  });

  if (graficoCarteiraAtivos) {
    graficoCarteiraAtivos.data.labels = labelsAtivos;
    graficoCarteiraAtivos.data.datasets[0].data = dataAtivos;
    graficoCarteiraAtivos.update(); 
  } else {
    graficoCarteiraAtivos = new Chart(ctxAtivos, {
      type: 'doughnut',
      data: { labels: labelsAtivos, datasets: [{ data: dataAtivos, backgroundColor: paletaCores, borderWidth: 0, hoverOffset: 10 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'right', labels: { color: '#e0e0e0', font: { family: 'Courier New', size: 11 } } } }, cutout: '65%' }
    });
  }

  if (graficoCarteiraSegmentos) {
    graficoCarteiraSegmentos.data.labels = Object.keys(distribuicaoSeg);
    graficoCarteiraSegmentos.data.datasets[0].data = Object.values(distribuicaoSeg);
    graficoCarteiraSegmentos.update(); 
  } else {
    graficoCarteiraSegmentos = new Chart(ctxSegmentos, {
      type: 'doughnut',
      data: { labels: Object.keys(distribuicaoSeg), datasets: [{ data: Object.values(distribuicaoSeg), backgroundColor: ['#ff9d00', '#ff4444', '#00e5ff', '#00ff88'], borderWidth: 0, hoverOffset: 10 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'right', labels: { color: '#e0e0e0', font: { family: 'Courier New', size: 11 } } } }, cutout: '65%' }
    });
  }
}

function atualizarPainel(fiis) {
  let totalPatrimonio = 0, totalCotas = 0;
  fiis.forEach(fii => { totalPatrimonio += fii.shares * fii.currentPrice; totalCotas += fii.shares; });

  let totalDividendos = 0;
  dadosApp.dividendos.forEach(d => totalDividendos += d.totalRecebido);

  document.getElementById("total-patrimony").innerText = formatarMoeda(totalPatrimonio);
  document.getElementById("total-dividends").innerText = `+ ${formatarMoeda(totalDividendos)}`;
  document.getElementById("total-shares").innerText = totalCotas;

  if (fiis.length > 0) {
    const destaque = fiis.reduce((prev, current) => (prev.shares * prev.currentPrice) > (current.shares * current.currentPrice) ? prev : current);
    document.getElementById("top-fii").innerText = destaque.ticker;
  } else {
    document.getElementById("top-fii").innerText = "Nenhum";
  }

  atualizarGraficos(fiis);
}

// --- BUSCA NA API DA BRAPI ---
async function puxarCotacaoB3(ticker, inputElement) {
  if (TOKEN_BRAPI === 'COLE_SEU_TOKEN_AQUI') return;
  try {
    inputElement.classList.add("input-loading"); 
    const response = await fetch(`https://brapi.dev/api/quote/${ticker}?token=${TOKEN_BRAPI}`);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      inputElement.value = data.results[0].regularMarketPrice;
      showToast(`Cotação da B3 injetada!`, "info");
    }
  } catch (e) {} finally { inputElement.classList.remove("input-loading"); }
}

async function atualizarCotacoesAPI(silencioso = false) {
  if (TOKEN_BRAPI === 'COLE_SEU_TOKEN_AQUI') return;
  const btn = document.getElementById("btn-refresh");
  const textoOriginal = btn.innerText;

  if (!silencioso) { btn.innerText = "...Verificando"; btn.disabled = true; }

  let houveMudanca = false;
  for (let i = 0; i < dadosApp.carteira.length; i++) {
    try {
      const response = await fetch(`https://brapi.dev/api/quote/${dadosApp.carteira[i].ticker}?token=${TOKEN_BRAPI}`);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const novoPreco = data.results[0].regularMarketPrice;
        if (dadosApp.carteira[i].currentPrice !== novoPreco) {
            dadosApp.carteira[i].currentPrice = novoPreco;
            houveMudanca = true;
        }
      }
    } catch (e) {}
  }

  if (houveMudanca) {
      await salvarDados(true); 
      recalcularCarteiraBaseadoNoHistorico(false);
  }
  if (!silencioso) { btn.innerText = textoOriginal; btn.disabled = false; showToast("Preços na B3 validados!", "success"); }
}

document.getElementById("btn-refresh").addEventListener("click", () => atualizarCotacoesAPI(false));

// --- MODAIS COM PROTEÇÃO (TRY/CATCH) ---
const modalOp = document.getElementById("modal-op");
const formOp = document.getElementById("form-add-op");

document.getElementById("btn-open-modal-op-dash").addEventListener("click", () => {
  document.getElementById("input-op-data").value = dataDeHojeSegura();
  document.getElementById("input-op-type").value = "Compra"; 
  modalOp.classList.remove("hidden");
});
document.getElementById("btn-open-modal-op").addEventListener("click", () => {
  document.getElementById("input-op-data").value = dataDeHojeSegura();
  modalOp.classList.remove("hidden");
});
document.getElementById("btn-close-modal-op").addEventListener("click", () => { modalOp.classList.add("hidden"); formOp.reset(); });
document.getElementById("input-op-ticker").addEventListener("blur", (e) => puxarCotacaoB3(e.target.value.toUpperCase(), document.getElementById("input-op-price")));

formOp.addEventListener("submit", async (e) => {
  e.preventDefault(); 
  try {
    const rawPrice = document.getElementById("input-op-price").value.replace(',', '.');
    
    dadosApp.historico.push({
      id: gerarIDUnico(),
      data: document.getElementById("input-op-data").value,
      operacao: document.getElementById("input-op-type").value,
      ticker: document.getElementById("input-op-ticker").value.toUpperCase(),
      cotas: parseInt(document.getElementById("input-op-shares").value),
      valor: parseFloat(rawPrice)
    });
    
    recalcularCarteiraBaseadoNoHistorico(true);
    await salvarDados(true);
    modalOp.classList.add("hidden"); formOp.reset();
    showToast("Operação registrada!", "success");
  } catch (error) {
    showToast("Erro ao processar os dados inseridos.", "error");
    console.error(error);
  }
});

const modalDiv = document.getElementById("modal-div");
const formDiv = document.getElementById("form-add-div");

document.getElementById("btn-open-modal-div").addEventListener("click", () => {
  document.getElementById("input-div-data").value = dataDeHojeSegura();
  modalDiv.classList.remove("hidden");
});
document.getElementById("btn-close-modal-div").addEventListener("click", () => { modalDiv.classList.add("hidden"); formDiv.reset(); });
document.getElementById("input-div-ticker").addEventListener("blur", (e) => puxarCotacaoB3(e.target.value.toUpperCase(), document.getElementById("input-div-price")));

formDiv.addEventListener("submit", async (e) => {
  e.preventDefault(); 
  try {
    const rawTotal = document.getElementById("input-div-total").value.replace(',', '.');
    const rawPrice = document.getElementById("input-div-price").value.replace(',', '.');

    const ticker = document.getElementById("input-div-ticker").value.toUpperCase();
    const totalRecebido = parseFloat(rawTotal);
    const cotasBase = parseInt(document.getElementById("input-div-shares").value);
    const valorCota = parseFloat(rawPrice);

    const dividendoPorCota = totalRecebido / cotasBase;
    const dy = (dividendoPorCota / valorCota) * 100;

    dadosApp.dividendos.push({
      id: gerarIDUnico(), data: document.getElementById("input-div-data").value,
      ticker, totalRecebido, cotasBase, dividendoPorCota, valorCota, dy
    });

    recalcularCarteiraBaseadoNoHistorico(true); 
    await salvarDados(true);
    modalDiv.classList.add("hidden"); formDiv.reset();
    showToast("Dividendo lançado!", "success");
  } catch (error) {
    showToast("Erro ao processar cálculos do dividendo.", "error");
    console.error(error);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  carregarDadosDoCofre();
  const datalist = document.getElementById("fii-suggestions");
  for (const ticker in dicionarioFIIs) {
    const option = document.createElement("option"); option.value = ticker; datalist.appendChild(option);
  }
  setInterval(() => { atualizarCotacoesAPI(true); }, 60000);
});