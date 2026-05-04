import React, { useState, useEffect, useMemo, useRef } from 'react';

// --- UTILIDADES ---
function parseCSV(str) {
  const arr = [];
  let quote = false;
  let row = 0, col = 0;
  for (let r = 0; r < str.length; r++) {
    let cc = str[r], nc = str[r + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++r; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { ++col; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++r; continue; }
    if (cc === '\n' && !quote) { ++row; col = 0; continue; }
    if (cc === '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  
  const headers = arr[0].map(h => h.trim());
  const data = [];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].length === 1 && !arr[i][0]) continue;
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = arr[i][j];
    }
    data.push(obj);
  }
  return data;
}

const fmtNum = (val) => (!val || val === 0 || isNaN(val)) ? '' : Math.round(val).toLocaleString('es-PA');
const fmtCur = (val) => (!val || val === 0 || isNaN(val)) ? '' : 'B/. ' + Number(val).toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (val) => (!val || val === 0 || isNaN(val) || !isFinite(val)) ? '' : (val * 100).toFixed(2) + '%';
const fmtCompact = (val) => {
  if (!val || val === 0 || isNaN(val)) return '0';
  return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(val);
};

const getNum = (row, possibleKeys) => {
  for (let k of possibleKeys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      const parsed = parseFloat(row[k].toString().replace(/[^0-9.-]+/g, ""));
      if (!isNaN(parsed)) return parsed;
    }
  }
  return 0;
};

const getStr = (row, possibleKeys) => {
  for (let k of possibleKeys) {
    if (row[k] !== undefined && row[k] !== null && row[k].trim() !== '') {
      return row[k].trim();
    }
  }
  return 'N/A';
};

const getBenchmarkCost = (campaignName, objectiveName) => {
  const camp = campaignName.toLowerCase();
  const obj = objectiveName.toLowerCase();
  
  const isAlcance = obj.includes('alcance');
  const isDescarga = obj.includes('descarga') || obj.includes('app');
  const isConversion = obj.includes('compra') || obj.includes('search') || isDescarga || obj.includes('convers') || obj.includes('resultado');
  const isVistas = obj.includes('vistas') || obj.includes('views') || obj.includes('reproducciones') || obj.includes('video');
  
  const isPromoApp = camp.includes('promo') && camp.includes('app');

  let cpm = 0.45;
  let cpc = 0.10;
  let cpa = 3.00;

  if (camp.includes('always on')) { cpa = 4.00; } 
  else if (camp.includes('apertura tienda')) { cpm = 0.45; } 
  else if (camp.includes('bucket summer')) { cpm = 0.50; cpa = 2.50; cpc = 0.02; } 
  else if (camp.includes('kupones')) { cpm = 0.90; cpc = 0.07; cpa = 2.00; } 
  else if (isPromoApp) { cpm = 0.50; cpc = 0.10; cpa = isDescarga ? 0.50 : 2.00; } 
  else if (camp.includes('promo alitas') || camp.includes('alitas')) { cpm = 0.50; cpc = 0.15; } 
  else if (camp.includes('wao deal') || camp.includes('waodeal')) { cpc = 0.03; cpm = 0.50; cpa = 3.00; }
  else if (camp.includes('coca cola') || camp.includes('cocacola')) { cpm = 0.45; cpc = 0.25; }
  else if (camp.includes('onion') || camp.includes('locales') || camp.includes('bucket navideño') || camp.includes('bucket navideno')) { cpc = 0.03; }

  if (isVistas) {
    if (isPromoApp) return { type: 'CPM_VISTAS', cost: 1.00 }; 
    if (camp.includes('bucket summer')) return { type: 'CPM_VISTAS', cost: 1.50 };
    return { type: 'CPM_VISTAS', cost: 4.50 };
  }
  if (isAlcance) return { type: 'CPM', cost: cpm };
  if (isConversion) return { type: 'CPA', cost: cpa };
  return { type: 'CPC', cost: cpc }; 
};

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [semanas, setSemanas] = useState([]);
  const [selectedSemana, setSelectedSemana] = useState('');
  
  const [expandedCamps, setExpandedCamps] = useState({});
  const [filterMode, setFilterMode] = useState('ALL');
  
  const [showAudit, setShowAudit] = useState(false); 
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState(''); // Estado para el mensaje flotante

  const topScrollRef = useRef(null);
  const tableContainerRef = useRef(null);
  const [tableWidth, setTableWidth] = useState('100%');

  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4fOSFda4MzcHuWjiXFjiGqVoZBOgjaseaOMsXVKBff7hSo_vM2eNkMu9mYcwsYzIeQLZGMdSJqLQy/pub?output=csv';

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        .no-print { display: none !important; }
        body { background: white !important; }
        .shadow-sm { box-shadow: none !important; border: 1px solid #e5e7eb; }
        .print-break-inside-avoid { break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    fetch(CSV_URL)
      .then(res => {
        if (!res.ok) throw new Error('Error al cargar la fuente de datos');
        return res.text();
      })
      .then(text => {
        const parsed = parseCSV(text);
        setData(parsed);
        
        const uniqueSemanas = [...new Set(parsed.map(r => getStr(r, ['Semana', 'Week'])))].filter(s => s !== 'N/A').sort();
        setSemanas(uniqueSemanas);
        if (uniqueSemanas.length > 0) {
          setSelectedSemana(uniqueSemanas[uniqueSemanas.length - 1]);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const toggleExpand = (key) => setExpandedCamps(prev => ({ ...prev, [key]: !prev[key] }));

  // --- LÓGICA DE AUDITORÍA DE BENCHMARKS ---
  const auditData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const anomalies = [];
    const grouped = {};
    
    data.forEach(row => {
       const week = getStr(row, ['Semana', 'Week']);
       const camp = getStr(row, ['Campaña', 'Campaign', 'Campaign name']);
       const obj = getStr(row, ['Objetivo', 'Objective']);
       const inversion = getNum(row, ['Inversión', 'Inversion', 'Amount spent', 'Gastos']);
       const impresiones = getNum(row, ['Impresiones', 'Impressions']);
       const clicks = getNum(row, ['Clicks', 'Clics', 'Link clicks']);
       const views = getNum(row, ['Views', 'Vistas', 'Video views', 'Reproducciones']);
       const conversiones = getNum(row, ['Conversiones', 'Conversions', 'Compras', 'Resultados']);

       const key = `${week}|${camp}|${obj}`;
       if (!grouped[key]) {
         grouped[key] = { week, camp, obj, inversion: 0, impresiones: 0, clicks: 0, views: 0, conversiones: 0 };
       }
       grouped[key].inversion += inversion;
       grouped[key].impresiones += impresiones;
       grouped[key].clicks += clicks;
       grouped[key].views += views;
       grouped[key].conversiones += conversiones;
    });

    Object.values(grouped).forEach(g => {
       if (g.inversion === 0) return; 

       const bench = getBenchmarkCost(g.camp, g.obj);
       let meta = 0, resultado = 0, costoReal = 0;

       if (bench.type === 'CPM' || bench.type === 'CPM_VISTAS') {
           resultado = bench.type === 'CPM' ? g.impresiones : g.views;
           meta = (g.inversion / bench.cost) * 1000;
           costoReal = resultado ? (g.inversion / resultado) * 1000 : 0;
       } else if (bench.type === 'CPA') {
           resultado = g.conversiones;
           meta = g.inversion / bench.cost;
           costoReal = resultado ? (g.inversion / resultado) : 0;
       } else {
           resultado = g.clicks;
           meta = g.inversion / bench.cost;
           costoReal = resultado ? (g.inversion / resultado) : 0;
       }

       const cump = meta ? resultado / meta : 0;
       
       if (cump > 3.5) { 
           anomalies.push({ ...g, benchType: bench.type, benchCost: bench.cost, costoReal, cump });
       }
    });

    return anomalies.sort((a, b) => b.week.localeCompare(a.week) || b.cump - a.cump);
  }, [data]);

  const processWeekData = (rawData, targetWeek) => {
    if (!rawData || !targetWeek) return null;
    const filtered = rawData.filter(r => getStr(r, ['Semana', 'Week']) === targetWeek);
    if (filtered.length === 0) return null;

    const campaigns = {};
    const weekTotal = {
      inversion: 0, alcance: 0, impresiones: 0, clicks: 0, views: 0, interaccion: 0, conversiones: 0, meta: 0, resultado: 0,
      hasAlcance: false, hasCPC: false, hasCPA: false
    };

    filtered.forEach(row => {
      const camp = getStr(row, ['Campaña', 'Campaign', 'Campaign name']);
      const obj = getStr(row, ['Objetivo', 'Objective']);
      const platRaw = getStr(row, ['Plataforma', 'Platform', 'Publisher Platform', 'Plataforma de editor', 'Red', 'Network']);
      const plat = platRaw === 'N/A' ? 'Red Consolidada' : platRaw;
      
      const inversion = getNum(row, ['Inversión', 'Inversion', 'Amount spent', 'Gastos']);
      const alcance = getNum(row, ['Alcance', 'Reach']);
      const impresiones = getNum(row, ['Impresiones', 'Impressions']);
      const clicks = getNum(row, ['Clicks', 'Clics', 'Link clicks']);
      const views = getNum(row, ['Views', 'Vistas', 'Video views', 'Reproducciones']);
      const interaccion = getNum(row, ['Interacción', 'Interacciones', 'Engagement']);
      const conversiones = getNum(row, ['Conversiones', 'Conversions', 'Compras', 'Resultados']);

      if (!campaigns[camp]) campaigns[camp] = { objectives: {}, total: { inversion: 0, alcance: 0, impresiones: 0, clicks: 0, views: 0, interaccion: 0, conversiones: 0, meta: 0, resultado: 0, hasAlcance: false, hasCPC: false, hasCPA: false } };
      if (!campaigns[camp].objectives[obj]) campaigns[camp].objectives[obj] = { inversion: 0, alcance: 0, impresiones: 0, clicks: 0, views: 0, interaccion: 0, conversiones: 0, platforms: {} };
      if (!campaigns[camp].objectives[obj].platforms[plat]) campaigns[camp].objectives[obj].platforms[plat] = { inversion: 0, alcance: 0, impresiones: 0, clicks: 0, views: 0, interaccion: 0, conversiones: 0 }; 

      const o = campaigns[camp].objectives[obj];
      const p = o.platforms[plat];

      p.inversion += inversion;
      p.alcance = Math.max(p.alcance, alcance); 
      p.impresiones += impresiones;
      p.clicks += clicks;
      p.views += views;
      p.interaccion += interaccion;
      p.conversiones += conversiones;

      o.inversion += inversion;
      o.alcance = Math.max(o.alcance, alcance);
      o.impresiones += impresiones;
      o.clicks += clicks;
      o.views += views;
      o.interaccion += interaccion;
      o.conversiones += conversiones;
    });

    Object.keys(campaigns).forEach(camp => {
      let maxCampAlcance = 0;
      const t = campaigns[camp].total;
      
      Object.keys(campaigns[camp].objectives).forEach(obj => {
        const o = campaigns[camp].objectives[obj];
        const objLower = obj.toLowerCase();
        
        const isAlcance = objLower.includes('alcance');
        const isDescarga = objLower.includes('descarga') || objLower.includes('app');
        const isConversion = objLower.includes('compra') || objLower.includes('search') || isDescarga || objLower.includes('convers') || objLower.includes('resultado');
        const isVistas = objLower.includes('vistas') || objLower.includes('views') || objLower.includes('reproducciones') || objLower.includes('video');
        const isTrafico = !isAlcance && !isConversion && !isVistas; 
        
        o.showCPM = isAlcance || isVistas;
        o.showCPA = isConversion;
        o.showCPC = isTrafico;
        o.benchmark = getBenchmarkCost(camp, obj);

        if (isAlcance) { o.resultado = o.impresiones; o.meta = (o.inversion / o.benchmark.cost) * 1000; } 
        else if (isVistas) { o.resultado = o.views; o.meta = (o.inversion / o.benchmark.cost) * 1000; } 
        else if (isConversion) { o.resultado = o.conversiones; o.meta = o.inversion / o.benchmark.cost; } 
        else { o.resultado = o.clicks; o.meta = o.inversion / o.benchmark.cost; }

        t.inversion += o.inversion;
        maxCampAlcance = Math.max(maxCampAlcance, o.alcance);
        t.impresiones += o.impresiones;
        t.clicks += o.clicks;
        t.views += o.views;
        t.interaccion += o.interaccion;
        t.conversiones += o.conversiones;
        t.resultado += o.resultado;
        t.meta += o.meta;

        t.hasAlcance = t.hasAlcance || o.showCPM;
        t.hasCPC = t.hasCPC || o.showCPC;
        t.hasCPA = t.hasCPA || o.showCPA;
      });
      
      t.alcance = maxCampAlcance;

      weekTotal.inversion += t.inversion;
      weekTotal.alcance = Math.max(weekTotal.alcance, maxCampAlcance);
      weekTotal.impresiones += t.impresiones;
      weekTotal.clicks += t.clicks;
      weekTotal.views += t.views;
      weekTotal.interaccion += t.interaccion;
      weekTotal.conversiones += t.conversiones;
      weekTotal.resultado += t.resultado;
      weekTotal.meta += t.meta;

      weekTotal.hasAlcance = weekTotal.hasAlcance || t.hasAlcance;
      weekTotal.hasCPC = weekTotal.hasCPC || t.hasCPC;
      weekTotal.hasCPA = weekTotal.hasCPA || t.hasCPA;
    });

    return { campaigns, weekTotal };
  };

  const processedData = useMemo(() => {
    if (!data.length || !selectedSemana) return { curr: null, prev: null };
    const curr = processWeekData(data, selectedSemana);
    const currentIdx = semanas.indexOf(selectedSemana);
    const prevSemana = currentIdx > 0 ? semanas[currentIdx - 1] : null;
    const prev = processWeekData(data, prevSemana);
    return { curr, prev };
  }, [data, selectedSemana, semanas]);

  const dashboardData = processedData.curr;
  const prevData = processedData.prev;

  // --- LÓGICA NARRATIVA AVANZADA, COMPACTA Y CONSTRUCTIVA ---
  const generateNarrativeContext = () => {
    if (!dashboardData) return null;

    const introWoW = () => {
      if (!prevData) return `La <strong>${selectedSemana}</strong> cerró con una inversión ejecutada de <strong>${fmtCur(dashboardData.weekTotal.inversion)}</strong>, logrando un alcance estimado de <strong>${fmtNum(dashboardData.weekTotal.alcance)} usuarios</strong>.`;
      
      const invDiff = ((dashboardData.weekTotal.inversion - prevData.weekTotal.inversion) / prevData.weekTotal.inversion) * 100;
      const convDiff = prevData.weekTotal.conversiones > 0 ? ((dashboardData.weekTotal.conversiones - prevData.weekTotal.conversiones) / prevData.weekTotal.conversiones) * 100 : 0;
      const cpaCurr = dashboardData.weekTotal.conversiones ? dashboardData.weekTotal.inversion / dashboardData.weekTotal.conversiones : 0;
      const cpaPrev = prevData.weekTotal.conversiones ? prevData.weekTotal.inversion / prevData.weekTotal.conversiones : 0;
      const cpaDiff = cpaPrev ? ((cpaCurr - cpaPrev) / cpaPrev) * 100 : 0;

      let trendText = "";
      if (convDiff > 5 && cpaDiff <= 0) trendText = `destacando un crecimiento del <strong>+${convDiff.toFixed(1)}% en conversiones totales</strong> mientras que el costo general de adquisición se mantuvo altamente eficiente frente a la semana anterior.`;
      else if (cpaDiff > 10) trendText = `experimentando un periodo de maduración y estabilización de subasta, con proyecciones de optimización para el próximo ciclo.`;
      else trendText = `manteniendo una eficiencia de costos de adquisición muy estable y saludable en comparación con el periodo inmediato anterior.`;

      return `Durante la <strong>${selectedSemana}</strong>, la inversión operativa cerró en <strong>${fmtCur(dashboardData.weekTotal.inversion)}</strong> (${invDiff > 0 ? '+' : ''}${invDiff.toFixed(1)}% vs sem. ant.). A nivel de cobertura global, impactamos a un estimado de <strong>${fmtNum(dashboardData.weekTotal.alcance)} usuarios</strong>, ${trendText}`;
    };

    const generateConclusion = () => {
      const convDiff = prevData && prevData.weekTotal.conversiones > 0 ? ((dashboardData.weekTotal.conversiones - prevData.weekTotal.conversiones) / prevData.weekTotal.conversiones) * 100 : 0;
      const cpaCurr = dashboardData.weekTotal.conversiones ? dashboardData.weekTotal.inversion / dashboardData.weekTotal.conversiones : 0;
      const cpaPrev = prevData?.weekTotal.conversiones ? prevData.weekTotal.inversion / prevData.weekTotal.conversiones : 0;
      const cpaDiff = cpaPrev ? ((cpaCurr - cpaPrev) / cpaPrev) * 100 : 0;

      let trendInsight = "";
      let nextSteps = "";

      if (convDiff > 0 && cpaDiff <= 0) {
        trendInsight = `Lo más destacable es la capacidad de la pauta para "estirar" el presupuesto, logrando un crecimiento orgánico-pagado en conversiones sin encarecer los costos. Esto confirma que el mix de plataformas está en su punto óptimo de rentabilidad.`;
        nextSteps = `Sugerimos mantener la presión de inversión en los canales que están traccionando resultados directos, y utilizar cualquier remanente para sostener la presencia audiovisual y nutrir audiencias futuras.`;
      } else if (cpaDiff > 10) {
        trendInsight = `En esta etapa hemos notado fluctuaciones naturales de mercado en los costos de adquisición. La estrategia sigue operando correctamente, y nos encontramos en un periodo donde los algoritmos están asimilando los ajustes para estabilizarse.`;
        nextSteps = `Será oportuno aplicar una rotación sutil de assets creativos para refrescar la atención del usuario y permitir que la inteligencia de las plataformas nos devuelva promedios más rentables la siguiente semana.`;
      } else {
        trendInsight = `El ecosistema se mantuvo sumamente resiliente. Logramos absorber la inversión garantizando un flujo constante de clics hacia las ofertas, cerrando el ciclo actual de forma sólida y estable.`;
        nextSteps = `De cara a la próxima semana, el enfoque será asegurar que los medios complementarios mantengan el volumen de alcance inicial necesario, permitiendo que las redes principales capturen esa intención comercial.`;
      }

      return `El rendimiento general refleja control táctico. ${trendInsight} <br/><br/><strong class="text-[#A3080B]">Recomendaciones y Siguientes Pasos:</strong> ${nextSteps}`;
    };

    const generatePlatformParagraph = (campName, platName, objectivesData) => {
        let sentences = [];

        // Evaluador WoW auxiliar con "excusas" suaves para negativos
        const getWowSpan = (diff, metricType) => {
            if (!diff || Math.abs(diff) < 2) return "";
            if (metricType === 'CPA' || metricType === 'CPC' || metricType === 'CPM') {
                if (diff < 0) return `<span class="text-green-700 font-medium">(mejorando el costo un ${Math.abs(diff).toFixed(1)}%)</span>`;
                if (diff > 5) {
                    const softPhrases = [
                        `(en proceso de estabilización algorítmica)`,
                        `(con variación natural, proyectando mejora)`,
                        `(ajustando aprendizajes para el próximo ciclo)`
                    ];
                    return `<span class="text-gray-500 italic">${softPhrases[Math.floor(Math.random() * softPhrases.length)]}</span>`;
                }
            }
            return "";
        };

        objectivesData.forEach(({ objective, data }) => {
            const objLower = objective.toLowerCase();
            const isDescarga = objLower.includes('descarga') || objLower.includes('app');
            const isConversion = objLower.includes('compra') || objLower.includes('search') || isDescarga || objLower.includes('convers') || objLower.includes('resultado');
            const isVistas = objLower.includes('vistas') || objLower.includes('views') || objLower.includes('video') || objLower.includes('reproducciones');
            const isAlcance = objLower.includes('alcance');
            const isTrafico = !isAlcance && !isConversion && !isVistas;

            const cpm = data.impresiones ? (data.inversion / data.impresiones) * 1000 : 0;
            const cpc = data.clicks ? data.inversion / data.clicks : 0;
            const cpa = data.conversiones ? data.inversion / data.conversiones : 0;

            let wowText = "";
            const prevDataPlat = prevData?.campaigns[campName]?.objectives[objective]?.platforms[platName];
            
            if (prevDataPlat) {
                if (isConversion && prevDataPlat.conversiones > 0) {
                    wowText = getWowSpan(((cpa - (prevDataPlat.inversion / prevDataPlat.conversiones)) / (prevDataPlat.inversion / prevDataPlat.conversiones)) * 100, 'CPA');
                } else if (isTrafico && prevDataPlat.clicks > 0) {
                    wowText = getWowSpan(((cpc - (prevDataPlat.inversion / prevDataPlat.clicks)) / (prevDataPlat.inversion / prevDataPlat.clicks)) * 100, 'CPC');
                } else if (isAlcance && prevDataPlat.impresiones > 0) {
                    wowText = getWowSpan(((cpm - ((prevDataPlat.inversion / prevDataPlat.impresiones)*1000)) / ((prevDataPlat.inversion / prevDataPlat.impresiones)*1000)) * 100, 'CPM');
                }
            }

            const seed = objective.length + platName.length;

            if (isConversion && data.conversiones > 0) {
                const phrases = [
                    `logró concretar <strong>${fmtNum(data.conversiones)} conversiones</strong> manteniendo un CPA de <strong>${fmtCur(cpa)}</strong> ${wowText}`,
                    `impulsó <strong>${fmtNum(data.conversiones)} resultados</strong> con una eficiencia en adquisición de <strong>${fmtCur(cpa)}</strong> ${wowText}`,
                    `cerró con éxito <strong>${fmtNum(data.conversiones)} transacciones</strong> (CPA <strong>${fmtCur(cpa)}</strong>) ${wowText}`
                ];
                sentences.push(phrases[seed % phrases.length].trim());
            } else if (isTrafico && data.clicks > 0) {
                const phrases = [
                    `generó un flujo de <strong>${fmtNum(data.clicks)} clics</strong> hacia el sitio a un CPC de <strong>${fmtCur(cpc)}</strong> ${wowText}`,
                    `captó <strong>${fmtNum(data.clicks)} visitas</strong> con un costo por clic muy competitivo de <strong>${fmtCur(cpc)}</strong> ${wowText}`,
                    `derivó <strong>${fmtNum(data.clicks)} clics</strong> efectivos (CPC <strong>${fmtCur(cpc)}</strong>) ${wowText}`
                ];
                sentences.push(phrases[seed % phrases.length].trim());
            } else if (isVistas && data.views > 0) {
                const phrases = [
                    `acumuló <strong>${fmtCompact(data.views)} reproducciones</strong> de video`,
                    `logró retener la atención visual con <strong>${fmtCompact(data.views)} vistas</strong>`,
                    `sumó <strong>${fmtCompact(data.views)} visualizaciones</strong> efectivas`
                ];
                sentences.push(phrases[seed % phrases.length].trim());
            } else if (isAlcance && data.impresiones > 0) {
                const phrases = [
                    `generó un volumen de <strong>${fmtCompact(data.impresiones)} impresiones</strong> para reforzar la visibilidad (CPM <strong>${fmtCur(cpm)}</strong>) ${wowText}`,
                    `logró captar la atención mediante <strong>${fmtCompact(data.impresiones)} impactos visuales</strong> a un CPM de <strong>${fmtCur(cpm)}</strong> ${wowText}`,
                    `aseguró una amplia cobertura aportando <strong>${fmtCompact(data.impresiones)} impresiones</strong> (CPM <strong>${fmtCur(cpm)}</strong>) ${wowText}`,
                    `entregó exitosamente <strong>${fmtCompact(data.impresiones)} impactos</strong> en su ecosistema (CPM <strong>${fmtCur(cpm)}</strong>) ${wowText}`,
                    `mantuvo una sólida presencia al registrar <strong>${fmtCompact(data.impresiones)} impresiones</strong> globales (CPM <strong>${fmtCur(cpm)}</strong>) ${wowText}`
                ];
                sentences.push(phrases[seed % phrases.length].trim());
            }
        });

        if (sentences.length === 0) return "Tuvo actividad de soporte en la campaña.";
        if (sentences.length === 1) return sentences[0] + '.';
        if (sentences.length === 2) return sentences[0] + ', y además ' + sentences[1] + '.';
        
        let finalStr = sentences[0];
        for (let i = 1; i < sentences.length - 1; i++) {
           finalStr += ', ' + sentences[i];
        }
        finalStr += ', mientras que paralelamente ' + sentences[sentences.length - 1] + '.';
        
        return finalStr.replace(/\s+/g, ' ').replace(/ \./g, '.').replace(/ ,/g, ',');
    };

    return { introWoW, generateConclusion, generatePlatformParagraph };
  };

  const narrativeCtx = generateNarrativeContext();

  // --- LÓGICA DE EXPORTACIÓN A EXCEL ---
  const exportToExcel = () => {
    if (!dashboardData) return;
    
    let csvContent = "\uFEFF"; // BOM para acentos en Excel
    // Usamos punto y coma (;) como separador para compatibilidad nativa con Excel en Español
    csvContent += "Campaña;Objetivo;Plataforma;Inversión;Meta Est.;Resultado;Cumplimiento %;Alcance;Impresiones;CPM;Clicks;CPC;Views;Interacción;Conversiones;Descargas;CPA\n";
    
    // Función para formatear decimales con coma (ej. 1200,50) para que Excel lo lea como número
    const formatNum = (num) => num.toFixed(2).replace('.', ',');

    Object.entries(dashboardData.campaigns).forEach(([camp, campData]) => {
      Object.entries(campData.objectives).forEach(([obj, o]) => {
        const cpm = o.impresiones ? (o.inversion / o.impresiones) * 1000 : 0;
        const cpc = o.clicks ? (o.inversion / o.clicks) : 0;
        const cpa = o.conversiones ? (o.inversion / o.conversiones) : 0;
        const cump = o.meta ? (o.resultado / o.meta) : 0;
        const isDescarga = obj.toLowerCase().includes('descarga');

        csvContent += `"${camp}";"${obj}";"TOTAL OBJETIVO";${formatNum(o.inversion)};${formatNum(o.meta)};${formatNum(o.resultado)};${formatNum(cump*100)}%;${o.alcance};${o.impresiones};${formatNum(cpm)};${o.clicks};${formatNum(cpc)};${o.views};${o.interaccion};${o.conversiones};${isDescarga ? o.conversiones : 0};${formatNum(cpa)}\n`;

        Object.entries(o.platforms).forEach(([plat, p]) => {
          const p_cpm = p.impresiones ? (p.inversion / p.impresiones) * 1000 : 0;
          const p_cpc = p.clicks ? (p.inversion / p.clicks) : 0;
          const p_cpa = p.conversiones ? (p.inversion / p.conversiones) : 0;
          
          csvContent += `"${camp}";"${obj}";"${plat}";${formatNum(p.inversion)};0,00;0,00;0,00%;${p.alcance};${p.impresiones};${formatNum(p_cpm)};${p.clicks};${formatNum(p_cpc)};${p.views};${p.interaccion};${p.conversiones};${isDescarga ? p.conversiones : 0};${formatNum(p_cpa)}\n`;
        });
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `KFC_Reporte_Semana_${selectedSemana}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- LÓGICA DE COPIAR A WHATSAPP ---
  const handleCopyWhatsApp = () => {
    if (!dashboardData) return;

    let waText = `🍗 *Reporte Ejecutivo KFC - Semana ${selectedSemana}* 🍗\n\n`;
    waText += `💰 *Inversión:* ${fmtCur(dashboardData.weekTotal.inversion)}\n`;
    waText += `🎯 *Alcance:* ${fmtNum(dashboardData.weekTotal.alcance)} usuarios\n`;
    if (dashboardData.weekTotal.conversiones > 0) waText += `📈 *Conversiones:* ${fmtNum(dashboardData.weekTotal.conversiones)}\n`;
    if (dashboardData.weekTotal.clicks > 0) waText += `🖱️ *Clics:* ${fmtNum(dashboardData.weekTotal.clicks)}\n`;
    waText += `\n📊 *Cumplimiento por Campaña:*\n`;
    
    Object.entries(dashboardData.campaigns).forEach(([camp, d]) => {
        const cump = d.total.meta ? (d.total.resultado / d.total.meta) : 0;
        let icon = '🔻';
        if (cump >= 1) icon = '✅';
        else if (cump >= 0.8) icon = '⚠️';
        waText += `${icon} *${camp}:* ${fmtPct(cump)} cump. (${fmtCur(d.total.inversion)})\n`;
    });

    waText += `\n💡 *Resumen Estratégico:* La inversión cerró exitosamente logrando gran exposición de marca. Nos mantenemos optimizando las subastas y activos creativos para asegurar la máxima rentabilidad en los siguientes días.`;

    // Truco para copiar al portapapeles sin problemas en iframes
    const el = document.createElement('textarea');
    el.value = waText;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);

    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // --- LÓGICA DE BARRA DE DESPLAZAMIENTO SUPERIOR ---
  useEffect(() => {
    const updateWidth = () => {
      if (tableContainerRef.current) {
        const tableEl = tableContainerRef.current.querySelector('table');
        if (tableEl) {
          setTableWidth(`${tableEl.offsetWidth}px`);
        }
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [dashboardData, expandedCamps]);

  const handleTopScroll = (e) => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const handleTableScroll = (e) => {
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const WowArrow = ({ current, previous, inverse = false }) => {
    if (!previous || previous === 0) return null;
    const pct = (current - previous) / previous;
    if (Math.abs(pct) < 0.02) return null; 
    const isGood = inverse ? pct < 0 : pct > 0;
    const color = isGood ? 'text-green-600' : 'text-red-600';
    return <span className={`text-[10px] ml-1 font-bold ${color}`} title="vs Sem. Anterior">{pct > 0 ? '▲' : '▼'}{Math.abs(pct * 100).toFixed(0)}%</span>;
  };

  const CellHeatmap = ({ val, benchmark, show, format }) => {
    if (!show || !val) return <td className="px-2 py-2 text-right text-gray-500 border-l border-gray-100"></td>;
    let bg = "text-gray-500";
    if (val <= benchmark * 0.90) bg = "bg-green-100/80 text-green-800 font-semibold";
    else if (val >= benchmark * 1.10) bg = "bg-red-100/80 text-red-800 font-semibold";
    return <td className={`px-2 py-2 text-right border-l border-gray-100 transition-colors ${bg}`}>{format(val)}</td>;
  };

  const chartColors = ['bg-red-600', 'bg-blue-500', 'bg-amber-500', 'bg-teal-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
  const campaignsList = dashboardData ? Object.entries(dashboardData.campaigns).map(([name, d]) => ({
    name, inversion: d.total.inversion, pct: (d.total.inversion / dashboardData.weekTotal.inversion) * 100
  })).sort((a,b) => b.inversion - a.inversion) : [];

  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-50"><div className="text-lg text-gray-600 animate-pulse font-medium">Cargando datos de campaña...</div></div>;
  if (error) return <div className="flex justify-center items-center h-screen"><div className="text-red-500 bg-red-100 p-4 rounded-lg font-medium border border-red-200">Error: {error}</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans p-4">
      
      {/* Header & Filtro */}
      <div className="max-w-[1600px] mx-auto bg-white p-5 rounded-xl shadow-sm mb-4 flex flex-col md:flex-row justify-between items-center border border-gray-100 print-break-inside-avoid">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <img 
            src="https://upload.wikimedia.org/wikipedia/sco/thumb/b/bf/KFC_logo.svg/1024px-KFC_logo.svg.png" 
            alt="KFC Logo Clásico" 
            className="h-16 w-auto object-contain"
            onError={(e) => { 
              e.target.onerror = null; 
              e.target.src = 'https://logos-world.net/wp-content/uploads/2020/04/KFC-Logo.png'; 
            }}
          />
          <div className="h-10 w-px bg-gray-200 mx-2 hidden md:block"></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard de Performance</h1>
            <p className="text-sm text-gray-500 no-print">Análisis avanzado, benchmarks y plataformas</p>
            <p className="text-sm text-gray-500 hidden print:block">Reporte Oficial - Semana {selectedSemana}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 no-print">
          <button 
            onClick={() => setShowAudit(!showAudit)} 
            className={`font-medium px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors border shadow-sm ${showAudit ? 'bg-red-600 text-white border-red-700 hover:bg-red-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            🛠️ Auditoría {auditData.length > 0 && <span className="bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 rounded-full font-black ml-1">{auditData.length}</span>}
          </button>

          <div className="flex bg-gray-100 rounded-lg border border-gray-300 p-0.5">
            <button onClick={exportToExcel} className="hover:bg-white text-gray-700 font-medium px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors">
              📊 Excel
            </button>
            <button onClick={() => {
              setToastMsg('Selecciona "Guardar como PDF" en la ventana que se abrirá en tu navegador.');
              setTimeout(() => { window.print(); setToastMsg(''); }, 2000);
            }} className="hover:bg-white text-gray-700 font-medium px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors">
              🖨️ PDF
            </button>
          </div>

          <div className="bg-gray-50 py-1.5 px-3 rounded-lg border border-gray-200 flex items-center gap-2">
            <label className="font-bold text-gray-800 uppercase text-xs tracking-wider">Semana:</label>
            <select 
              className="bg-white border border-gray-300 rounded px-2 py-1 focus:ring-red-500 focus:border-red-500 font-bold text-red-600 outline-none cursor-pointer"
              value={selectedSemana} 
              onChange={(e) => setSelectedSemana(e.target.value)}
            >
              {semanas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* BLOQUE DE AUDITORÍA DE BENCHMARKS */}
      {showAudit && auditData && (
        <div className="max-w-[1600px] mx-auto mb-6 bg-red-50/50 p-6 rounded-xl shadow-sm border border-red-200 no-print animate-fade-in">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-red-900 flex items-center gap-2">
                🚨 Auditoría de Anomalías ({'>'}350% Cumplimiento)
              </h2>
              <p className="text-sm text-red-700 mt-1">Usa la columna <strong>"Costo Real"</strong> para ajustar tu código y volver las metas más realistas. Datos de todo el histórico.</p>
            </div>
            <button onClick={() => setShowAudit(false)} className="text-red-500 hover:text-red-700 text-sm font-bold underline">Cerrar Tabla</button>
          </div>
          
          {auditData.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-lg border border-red-100 text-green-700 font-bold">
              ✅ Excelente. No hay ninguna campaña superando el 350% de cumplimiento. Tus benchmarks son realistas.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border border-red-100 shadow-inner">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-red-100 text-red-900 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-3 font-bold border-r border-red-200">Semana</th>
                    <th className="px-3 py-3 font-bold border-r border-red-200">Campaña</th>
                    <th className="px-3 py-3 font-bold border-r border-red-200">Objetivo</th>
                    <th className="px-3 py-3 font-bold text-center border-r border-red-200">Métrica Evaluada</th>
                    <th className="px-3 py-3 font-bold text-right border-r border-red-200">Benchmark Actual (Código)</th>
                    <th className="px-3 py-3 font-black text-right border-r border-red-200 text-red-700 bg-red-50">Costo Real de la Campaña</th>
                    <th className="px-3 py-3 font-bold text-right">Cumplimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {auditData.map((row, i) => (
                    <tr key={i} className="hover:bg-red-50 transition-colors">
                      <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-100">{row.week}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900 border-r border-gray-100">{row.camp}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-100">{row.obj}</td>
                      <td className="px-3 py-2 font-bold text-gray-500 text-center border-r border-gray-100">{row.benchType.replace('_VISTAS', '')}</td>
                      <td className="px-3 py-2 text-right text-gray-500 border-r border-gray-100 bg-gray-50">{fmtCur(row.benchCost)}</td>
                      <td className="px-3 py-2 text-right font-black text-[#A3080B] border-r border-gray-100 bg-red-50/50 text-[14px]">
                        {fmtCur(row.costoReal)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-red-800">{fmtPct(row.cump)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Mini Gráficos (Data Viz) */}
      {dashboardData && (
        <div className="max-w-[1600px] mx-auto mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 print-break-inside-avoid">
          <div className="md:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-center">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Share de Inversión por Campaña</span>
            </div>
            <div className="flex h-6 w-full border border-gray-100 rounded-full bg-gray-100">
              {campaignsList.map((c, i) => (
                <div 
                  key={c.name} 
                  style={{ width: `${c.pct}%` }} 
                  className={`${chartColors[i % chartColors.length]} group relative cursor-help transition-all hover:opacity-80 first:rounded-l-full last:rounded-r-full`}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-900 text-white text-[11px] py-1.5 px-3 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg transition-opacity duration-200">
                    <span className="font-bold">{c.name}</span>: {fmtCur(c.inversion)} ({c.pct.toFixed(1)}%)
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {campaignsList.map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5 text-[10px] text-gray-600 uppercase">
                  <span className={`w-2 h-2 rounded-full ${chartColors[i % chartColors.length]}`}></span>
                  <span className="truncate max-w-[150px]" title={c.name}>{c.name}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Inversión Total {selectedSemana}</span>
            <div className="text-3xl font-black text-gray-900">{fmtCur(dashboardData.weekTotal.inversion)}</div>
            {prevData && (
              <div className="text-xs font-medium mt-1 flex items-center gap-1 justify-center italic text-gray-500">
                vs anterior: {fmtCur(prevData.weekTotal.inversion)} 
                <WowArrow current={dashboardData.weekTotal.inversion} previous={prevData.weekTotal.inversion} inverse={true} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabla Dashboard Compacta */}
      <div className="max-w-[1600px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 print-break-inside-avoid">
        
        <div 
          className="overflow-x-auto overflow-y-hidden no-print" 
          ref={topScrollRef} 
          onScroll={handleTopScroll}
        >
          <div style={{ width: tableWidth, height: '1px' }}></div>
        </div>

        <div className="overflow-x-auto" ref={tableContainerRef} onScroll={handleTableScroll}>
          <table className="w-full text-xs text-right whitespace-nowrap">
            {/* ENCABEZADO ROJO KFC */}
            <thead className="text-white uppercase tracking-wider text-[11px]" style={{ backgroundColor: '#A3080B' }}>
              <tr>
                <th className="px-2 py-2.5 text-center font-semibold sticky left-0 z-10 w-[110px] min-w-[110px] max-w-[110px] whitespace-normal leading-tight shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] border-r border-[#8B0000]" style={{ backgroundColor: '#A3080B' }}>Campaña</th>
                <th className="px-2 py-2.5 text-left font-semibold">Objetivo</th>
                <th className="px-2 py-2.5 font-semibold">Inversión</th>
                <th className="px-2 py-2.5 font-semibold bg-black/10" title="Calculada automáticamente usando Benchmarks">Meta (Est.)</th>
                <th className="px-2 py-2.5 font-semibold">Resultado</th>
                <th className="px-2 py-2.5 font-semibold">Cumpl.</th>
                <th className="px-2 py-2.5 font-semibold">Alcance</th>
                <th className="px-2 py-2.5 font-semibold">Impresiones</th>
                <th className="px-2 py-2.5 font-semibold text-gray-200 border-l border-[#8B0000]">CPM <span className="text-[9px] text-gray-300 font-normal block no-print">Heatmap</span></th>
                <th className="px-2 py-2.5 font-semibold">Clicks</th>
                <th className="px-2 py-2.5 font-semibold text-gray-200 border-l border-[#8B0000]">CPC <span className="text-[9px] text-gray-300 font-normal block no-print">Heatmap</span></th>
                <th className="px-2 py-2.5 font-semibold">Views</th>
                <th className="px-2 py-2.5 font-semibold">Interacción</th>
                <th className="px-2 py-2.5 font-semibold">Conversiones</th>
                <th className="px-2 py-2.5 font-semibold text-pink-200">Descargas</th>
                <th className="px-3 py-2.5 font-semibold text-gray-200 border-l border-[#8B0000]">CPA <span className="text-[9px] text-gray-300 font-normal block no-print">Heatmap</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              
              {dashboardData && Object.entries(dashboardData.campaigns).map(([camp, campData]) => {
                let campRowSpan = Object.keys(campData.objectives).length + 1;
                Object.keys(campData.objectives).forEach(obj => {
                  if (expandedCamps[`${camp}-${obj}`]) campRowSpan += Object.keys(campData.objectives[obj].platforms).length;
                });

                return (
                  <React.Fragment key={camp}>
                    {Object.entries(campData.objectives).map(([obj, o], index) => {
                      const isDescarga = obj.toLowerCase().includes('descarga');
                      const objKey = `${camp}-${obj}`;
                      const isExpanded = expandedCamps[objKey];
                      
                      const cpm = o.impresiones ? (o.inversion / o.impresiones) * 1000 : 0;
                      const cpc = o.clicks ? (o.inversion / o.clicks) : 0;
                      const cpa = o.conversiones ? (o.inversion / o.conversiones) : 0;
                      const cumplimiento = o.meta ? (o.resultado / o.meta) : 0;

                      const mainRow = (
                        <tr key={obj} className="hover:bg-red-50/50 transition-colors">
                          {index === 0 && (
                            <td 
                              rowSpan={campRowSpan} 
                              className="px-2 py-2 text-center align-middle font-bold text-gray-900 sticky left-0 bg-white z-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-b border-gray-200 w-[110px] min-w-[110px] max-w-[110px] whitespace-normal break-words leading-snug uppercase border-r"
                            >
                              {camp}
                            </td>
                          )}
                          <td className="px-2 py-2 text-left flex items-center gap-1.5 min-w-[150px]">
                            {Object.keys(o.platforms).length > 1 && (
                              <button onClick={() => toggleExpand(objKey)} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 w-4 h-4 rounded-sm flex items-center justify-center font-bold no-print transition-colors">
                                {isExpanded ? '-' : '+'}
                              </button>
                            )}
                            <span className="text-gray-700 font-medium truncate max-w-[150px]" title={obj}>{obj}</span>
                          </td>
                          <td className="px-2 py-2">{fmtCur(o.inversion)}</td>
                          <td className="px-2 py-2 font-medium text-gray-700 bg-gray-50/50">{fmtNum(o.meta)}</td>
                          <td className="px-2 py-2 font-bold text-blue-600">{fmtNum(o.resultado)}</td>
                          <td className={`px-2 py-2 font-bold ${cumplimiento >= 1 ? 'text-green-600' : (cumplimiento > 0 ? 'text-amber-600' : 'text-gray-400')}`}>
                            {fmtPct(cumplimiento)}
                          </td>
                          <td className="px-2 py-2">{fmtNum(o.alcance)}</td>
                          <td className="px-2 py-2">{fmtNum(o.impresiones)}</td>
                          <CellHeatmap val={cpm} benchmark={o.benchmark.cost} show={o.showCPM} format={fmtCur} />
                          <td className="px-2 py-2">{fmtNum(o.clicks)}</td>
                          <CellHeatmap val={cpc} benchmark={o.benchmark.cost} show={o.showCPC} format={fmtCur} />
                          <td className="px-2 py-2">{fmtNum(o.views)}</td>
                          <td className="px-2 py-2">{fmtNum(o.interaccion)}</td>
                          <td className="px-2 py-2">{fmtNum(o.conversiones)}</td>
                          <td className="px-2 py-2 font-medium text-purple-600">{isDescarga ? fmtNum(o.conversiones) : ''}</td>
                          <CellHeatmap val={cpa} benchmark={o.benchmark.cost} show={o.showCPA} format={fmtCur} />
                        </tr>
                      );

                      const platRows = isExpanded ? Object.entries(o.platforms).map(([plat, p]) => {
                        const p_cpm = p.impresiones ? (p.inversion / p.impresiones) * 1000 : 0;
                        const p_cpc = p.clicks ? (p.inversion / p.clicks) : 0;
                        const p_cpa = p.conversiones ? (p.inversion / p.conversiones) : 0;
                        
                        return (
                          <tr key={`${obj}-${plat}`} className="bg-gray-50/80 text-[10px] text-gray-500 hover:bg-gray-100 transition-colors">
                            <td className="px-2 py-1.5 text-left pl-8 italic border-l-2 border-red-200">↳ {plat}</td>
                            <td className="px-2 py-1.5">{fmtCur(p.inversion)}</td>
                            <td className="px-2 py-1.5 bg-gray-100/50">-</td>
                            <td className="px-2 py-1.5">-</td>
                            <td className="px-2 py-1.5">-</td>
                            <td className="px-2 py-1.5">-</td>
                            <td className="px-2 py-1.5">{fmtNum(p.impresiones)}</td>
                            <td className="px-2 py-1.5 border-l border-gray-100">{o.showCPM ? fmtCur(p_cpm) : ''}</td>
                            <td className="px-2 py-1.5">{fmtNum(p.clicks)}</td>
                            <td className="px-2 py-1.5 border-l border-gray-100">{o.showCPC ? fmtCur(p_cpc) : ''}</td>
                            <td className="px-2 py-1.5">{fmtNum(p.views)}</td>
                            <td className="px-2 py-1.5">{fmtNum(p.interaccion)}</td>
                            <td className="px-2 py-1.5">{fmtNum(p.conversiones)}</td>
                            <td className="px-2 py-1.5">{isDescarga ? fmtNum(p.conversiones) : ''}</td>
                            <td className="px-3 py-1.5 border-l border-gray-100">{o.showCPA ? fmtCur(p_cpa) : ''}</td>
                          </tr>
                        );
                      }) : [];

                      return <React.Fragment key={obj}>{mainRow}{platRows}</React.Fragment>;
                    })}
                    
                    <tr className="bg-gray-100/80 font-semibold text-gray-900 border-t border-gray-300 italic">
                      <td className="px-2 py-2 text-left">Total Campaña</td>
                      <td className="px-2 py-2">{fmtCur(campData.total.inversion)}</td>
                      <td className="px-2 py-2 text-gray-700">{fmtNum(campData.total.meta)}</td>
                      <td className="px-2 py-2 text-blue-700">{fmtNum(campData.total.resultado)}</td>
                      <td className="px-2 py-2 text-gray-700">{fmtPct(campData.total.meta ? (campData.total.resultado / campData.total.meta) : 0)}</td>
                      <td className="px-2 py-2 font-bold">{fmtNum(campData.total.alcance)}</td>
                      <td className="px-2 py-2 font-bold">{fmtNum(campData.total.impresiones)}</td>
                      <td className="px-2 py-2 text-gray-600 border-l border-gray-200">{campData.total.hasAlcance && campData.total.impresiones ? fmtCur((campData.total.inversion / campData.total.impresiones) * 1000) : ''}</td>
                      <td className="px-2 py-2 font-bold">{fmtNum(campData.total.clicks)}</td>
                      <td className="px-2 py-2 text-gray-600 border-l border-gray-200">{campData.total.hasCPC && campData.total.clicks ? fmtCur(campData.total.inversion / campData.total.clicks) : ''}</td>
                      <td className="px-2 py-2 font-bold">{fmtNum(campData.total.views)}</td>
                      <td className="px-2 py-2 font-bold">{fmtNum(campData.total.interaccion)}</td>
                      <td className="px-2 py-2 font-bold">{fmtNum(campData.total.conversiones)}</td>
                      <td className="px-2 py-2 text-purple-700 font-bold">{fmtNum(Object.entries(campData.objectives).reduce((acc, [k, v]) => acc + (k.toLowerCase().includes('descarga') ? v.conversiones : 0), 0))}</td>
                      <td className="px-3 py-2 text-gray-600 border-l border-gray-200">{campData.total.hasCPA && campData.total.conversiones ? fmtCur(campData.total.inversion / campData.total.conversiones) : ''}</td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* FILA OSCURA DE TOTAL SEMANA */}
              {dashboardData && (
                <tr className="bg-gray-800 text-white font-bold text-[13px] shadow-inner border-t-2 border-gray-900 uppercase">
                  <td className="px-2 py-3 text-center align-middle sticky left-0 bg-gray-800 z-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] w-[110px] min-w-[110px] max-w-[110px] whitespace-normal break-words leading-tight border-r border-gray-700">TOTAL SEMANA</td>
                  <td className="px-2 py-3 text-left"></td>
                  <td className="px-2 py-3">{fmtCur(dashboardData.weekTotal.inversion)}</td>
                  <td className="px-2 py-3 text-gray-400">{fmtNum(dashboardData.weekTotal.meta)}</td>
                  <td className="px-2 py-3 text-white">
                    {fmtNum(dashboardData.weekTotal.resultado)}
                  </td>
                  <td className="px-2 py-3 text-gray-300">{fmtPct(dashboardData.weekTotal.meta ? (dashboardData.weekTotal.resultado / dashboardData.weekTotal.meta) : 0)}</td>
                  <td className="px-2 py-3">{fmtNum(dashboardData.weekTotal.alcance)}</td>
                  <td className="px-2 py-3">{fmtNum(dashboardData.weekTotal.impresiones)}</td>
                  <td className="px-2 py-3 text-gray-300 border-l border-gray-600">
                    {dashboardData.weekTotal.hasAlcance && dashboardData.weekTotal.impresiones ? fmtCur((dashboardData.weekTotal.inversion / dashboardData.weekTotal.impresiones) * 1000) : ''}
                  </td>
                  <td className="px-2 py-3">{fmtNum(dashboardData.weekTotal.clicks)}</td>
                  <td className="px-2 py-3 text-gray-300 border-l border-gray-600">
                    {dashboardData.weekTotal.hasCPC && dashboardData.weekTotal.clicks ? fmtCur(dashboardData.weekTotal.inversion / dashboardData.weekTotal.clicks) : ''}
                  </td>
                  <td className="px-2 py-3 text-gray-200">{fmtNum(dashboardData.weekTotal.views)}</td>
                  <td className="px-2 py-3 text-gray-200">{fmtNum(dashboardData.weekTotal.interaccion)}</td>
                  <td className="px-2 py-3 text-blue-300">
                    {fmtNum(dashboardData.weekTotal.conversiones)}
                  </td>
                  <td className="px-2 py-3 text-pink-300">
                    {fmtNum(Object.entries(dashboardData.campaigns).reduce((accCamp, [_, cData]) => accCamp + Object.entries(cData.objectives).reduce((accObj, [k, v]) => accObj + (k.toLowerCase().includes('descarga') ? v.conversiones : 0), 0), 0))}
                  </td>
                  <td className="px-3 py-3 text-gray-300 border-l border-gray-600">
                    {dashboardData.weekTotal.hasCPA && dashboardData.weekTotal.conversiones ? fmtCur(dashboardData.weekTotal.inversion / dashboardData.weekTotal.conversiones) : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CUADRO DE INSIGHTS CON FILTROS (Meta/Cumplimiento) */}
      {dashboardData && (
        <div className="max-w-[1600px] mx-auto mt-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200 print-break-inside-avoid">
          <div className="mb-6 border-b border-gray-100 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-xl">💡</span> Insights de Rendimiento
              </h2>
              <p className="text-gray-500 mt-1 text-sm">Tarjetas de alerta y cumplimiento contra meta.</p>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-medium no-print">
              <button onClick={() => setFilterMode('ALL')} className={`px-3 py-1.5 rounded-md transition-colors ${filterMode === 'ALL' ? 'bg-white shadow text-gray-900 font-bold' : 'text-gray-600 hover:bg-gray-200'}`}>Todas</button>
              <button onClick={() => setFilterMode('SUCCESS')} className={`px-3 py-1.5 rounded-md transition-colors ${filterMode === 'SUCCESS' ? 'bg-green-100 text-green-800 font-bold' : 'text-gray-600 hover:bg-gray-200'}`}>✅ Superan</button>
              <button onClick={() => setFilterMode('WARNING')} className={`px-3 py-1.5 rounded-md transition-colors ${filterMode === 'WARNING' ? 'bg-amber-100 text-amber-800 font-bold' : 'text-gray-600 hover:bg-gray-200'}`}>⚠️ Cerca</button>
              <button onClick={() => setFilterMode('DANGER')} className={`px-3 py-1.5 rounded-md transition-colors ${filterMode === 'DANGER' ? 'bg-red-100 text-red-800 font-bold' : 'text-gray-600 hover:bg-gray-200'}`}>🔻 Bajo Meta</button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Object.entries(dashboardData.campaigns).map(([camp, campData]) => {
              const cump = campData.total.meta ? (campData.total.resultado / campData.total.meta) : 0;
              let statusCat = 'DANGER', statusColor = 'text-red-700', statusBg = 'bg-red-100', statusText = '🔻 Bajo Meta';
              
              if (campData.total.meta === 0) { statusCat = 'ALL'; statusText = 'Sin Meta'; statusColor = 'text-gray-500'; statusBg = 'bg-gray-100'; }
              else if (cump >= 1) { statusCat = 'SUCCESS'; statusColor = 'text-green-700'; statusBg = 'bg-green-100'; statusText = '✅ Supera Meta'; }
              else if (cump >= 0.8) { statusCat = 'WARNING'; statusColor = 'text-amber-700'; statusBg = 'bg-amber-100'; statusText = '⚠️ Cerca de Meta'; }

              if (filterMode !== 'ALL' && filterMode !== statusCat) return null;

              return (
                <div key={camp} className="p-4 rounded-lg border border-gray-200 bg-gray-50/50 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm mb-3 line-clamp-2 uppercase" title={camp}>{camp}</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="bg-white p-2 rounded border border-gray-100 shadow-sm">
                        <span className="block text-gray-500 mb-1">Inversión</span>
                        <span className="font-semibold text-gray-900">{fmtCur(campData.total.inversion)}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-gray-100 shadow-sm">
                        <span className="block text-gray-500 mb-1">Cumplimiento</span>
                        <span className={`font-bold text-sm ${statusColor}`}>{fmtPct(cump)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`mt-auto inline-flex px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider self-start ${statusBg} ${statusColor}`}>
                    {statusText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* COMENTARIOS GENERALES - VERSIÓN COMPACTA Y HUMANIZADA */}
      {dashboardData && narrativeCtx && (
        <div className="max-w-[1600px] mx-auto mt-6 mb-12 bg-white p-8 rounded-xl shadow-sm border border-gray-200 print-break-inside-avoid relative">
          
          <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
            <h2 className="text-xl font-bold text-gray-900">Comentarios Generales:</h2>
            <button 
              onClick={handleCopyWhatsApp}
              className={`no-print px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${copied ? 'bg-green-600 text-white shadow-inner' : 'bg-green-100 text-green-800 hover:bg-green-200'}`}
            >
              {copied ? '¡Copiado!' : '📱 Copiar Resumen (WhatsApp)'}
            </button>
          </div>
          
          <p className="text-sm text-gray-800 leading-relaxed mb-6" dangerouslySetInnerHTML={{ __html: narrativeCtx.introWoW() }} />

          <div className="space-y-6">
            {Object.entries(dashboardData.campaigns).map(([camp, campData]) => {
              
              // Agrupar por plataforma ignorando el "ecosistema"
              const platformsMap = {};
              Object.entries(campData.objectives).forEach(([objName, o]) => {
                Object.entries(o.platforms).forEach(([platName, pData]) => {
                  if(!platformsMap[platName]) platformsMap[platName] = [];
                  platformsMap[platName].push({ objective: objName, data: pData });
                });
              });

              // Ordenar por inversión total descendente
              const sortedPlats = Object.entries(platformsMap).sort((a,b) => {
                 const invA = a[1].reduce((sum, item) => sum + item.data.inversion, 0);
                 const invB = b[1].reduce((sum, item) => sum + item.data.inversion, 0);
                 return invB - invA;
              });

              return (
                <div key={camp} className="border-b border-gray-100 pb-5 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="font-bold text-gray-900 uppercase text-[14px] tracking-wide">{camp}</h3>
                    {campData.total.alcance > 0 && (
                      <span className="text-gray-500 text-[11px] font-medium">Alcance est: {fmtNum(campData.total.alcance)} usuarios</span>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {sortedPlats.map(([platName, objectivesList]) => (
                      <p key={platName} className="text-gray-800 leading-relaxed text-[13px] bg-gray-50/50 p-2.5 rounded-md border border-gray-100">
                        <strong className="font-bold text-gray-900">{platName}: </strong>
                        <span dangerouslySetInnerHTML={{ __html: narrativeCtx.generatePlatformParagraph(camp, platName, objectivesList) }} />
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 bg-red-50/30 p-4 rounded-lg">
            <p className="text-sm text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: narrativeCtx.generateConclusion() }} />
          </div>
        </div>
      )}

      {/* TOAST DE AVISO FLOTANTE (NO SE IMPRIME) */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 bg-gray-900 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 no-print border border-gray-700 animate-fade-in">
          <span className="text-xl">🖨️</span>
          <span className="font-medium text-sm">{toastMsg}</span>
        </div>
      )}

    </div>
  );
}