"use strict";

(() => {
  const state = { radar: null, temperature: null, errors: {}, busy: false };
  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const text = (id, value) => { byId(id).textContent = value; };
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const number = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string" || !value.trim()) return null;
    const clean = value.trim().replace(/,/g, "");
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean) && Number.isFinite(Number(clean)) ? Number(clean) : null;
  };
  const fmt = (value, digits = 1) => number(value) === null ? "—" : number(value).toLocaleString("zh-TW", { maximumFractionDigits: digits });
  const dateKey = (value) => {
    if (typeof value !== "string") return null;
    const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const dateLabel = (value) => dateKey(value)?.replace(/-/g, "/") ?? "未提供";
  const shortDate = (value) => dateKey(value)?.slice(5).replace("-", "/") ?? "—";
  const latestTemperature = () => state.temperature?.status === "unavailable" ? null : state.temperature?.latest;
  const temperatureDate = () => dateKey(latestTemperature()?.date) || dateKey(state.temperature?.asOf);
  const briefText = (value, fallback) => typeof value === "string" && value.trim() ? value : fallback;
  const marketState = () => briefText(latestTemperature()?.state ?? latestTemperature()?.structure?.title ?? state.temperature?.state, "市場觀察");
  const daysOld = (value) => {
    const date = dateKey(value);
    const today = dateKey(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
    return date && today ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000) : null;
  };

  function records(data, kind) {
    const dates = new Map();
    (Array.isArray(data?.history) ? data.history : []).forEach((row) => {
      if (!isObject(row)) return;
      const date = dateKey(row.date);
      if (date) dates.set(date, { date, score: number(kind === "temperature" ? row.temperature ?? row.score : row.score) });
    });
    const latest = kind === "temperature" ? latestTemperature() : data;
    const date = kind === "temperature" ? temperatureDate() : dateKey(data?.snapshotDate);
    if (date && latest && data?.status !== "unavailable") dates.set(date, { date, score: number(kind === "temperature" ? latest.temperature : latest.score) });
    return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderOverview() {
    const latest = latestTemperature(), temperature = number(latest?.temperature);
    const radar = state.radar?.status === "unavailable" ? null : number(state.radar?.score);
    text("temperature-score", fmt(temperature));
    text("temperature-scale", temperature === null ? "" : "°C");
    text("temperature-state", temperature === null ? "目前無法提供溫度" : daysOld(temperatureDate()) > 7 ? "資料尚待更新" : marketState());
    text("temperature-date", `資料日：${dateLabel(temperatureDate())}`);
    text("radar-score", fmt(radar));
    text("radar-scale", radar === null ? "" : "／100");
    text("radar-state", radar === null ? "目前無法提供分數" : briefText(state.radar?.state, "資金觀察"));
    text("radar-date", `交易日：${dateLabel(state.radar?.asOf)}`);
    text("market-chart-date", `資料日：${dateLabel(temperatureDate())}`);
    text("industry-date", `資料日：${dateLabel(state.radar?.asOf)}`);
    byId("structure-card").innerHTML = temperature === null ? `<p class="empty-state">目前沒有可用的市場狀態。</p>` : `<p class="eyebrow">市場狀態</p><h3>${esc(marketState())}</h3>`;
  }

  function renderNotices() {
    const notices = [];
    [["temperature", "大盤籌碼溫度", state.temperature, temperatureDate()], ["radar", "資金雷達", state.radar, dateKey(state.radar?.asOf)]].forEach(([key, title, data, date]) => {
      const messages = [];
      const missing = key === "temperature" ? number(latestTemperature()?.temperature) === null : number(data?.score) === null;
      if (state.errors[key]) messages.push(data ? "暫時無法更新，目前保留上次讀取的結果。" : "資料暫時無法讀取，請稍後刷新。");
      if (data && (data.status === "unavailable" || missing)) messages.push("部分資料不足，目前無法提供完整結果。");
      else if (data?.status === "partial") messages.push("部分資料不足，請留意結果與資料日。");
      if (date && daysOld(date) > 7) messages.push(`資料尚未更新，最新資料日為 ${dateLabel(date)}。`);
      if (data && !date) messages.push("資料日期尚未齊全，請稍後再查看。");
      if (messages.length) notices.push(`<div class="notice"><strong>${esc(title)}｜資料提醒</strong>${[...new Set(messages)].map((message) => `<p>${esc(message)}</p>`).join("")}</div>`);
    });
    byId("data-notices").innerHTML = notices.join("");
  }

  function chartMarkup(input, label, kind = "temperature", limit = 60) {
    const rows = input.slice(-limit), valid = rows.filter((row) => row.score !== null);
    if (!valid.length) return `<p class="empty-state">目前沒有可用的${esc(label)}紀錄。</p>`;
    const latest = valid.at(-1), unit = kind === "temperature" ? "°C" : "分";
    const min = Math.floor(Math.min(0, ...valid.map((row) => row.score)) / 10) * 10;
    const max = Math.ceil(Math.max(100, ...valid.map((row) => row.score)) / 10) * 10;
    const stroke = kind === "temperature" ? "#B9853B" : "#1D5660";
    const x = (index) => rows.length === 1 ? 300 : 8 + index / (rows.length - 1) * 584;
    const y = (score) => 190 - (score - min) / (max - min || 1) * 180;
    const segments = [];
    let segment = [];
    rows.forEach((row, index) => {
      if (row.score === null) { if (segment.length) segments.push(segment); segment = []; }
      else segment.push({ x: x(index), y: y(row.score) });
    });
    if (segment.length) segments.push(segment);
    const lines = segments.map((part) => part.length > 1 ? `<polyline points="${part.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : "").join("");
    const dots = segments.flatMap((part) => part.map((point) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.5" fill="${stroke}"/>`)).join("");
    const range = rows.length === 1 ? dateLabel(rows[0].date) : `${dateLabel(rows[0].date)} 至 ${dateLabel(rows.at(-1).date)}`;
    const middle = rows[Math.floor((rows.length - 1) / 2)];
    const dateMeaning = kind === "temperature" ? "資料日" : "整理日";
    return `<div class="chart-top"><p class="chart-current ${kind === "radar" ? "cyan" : ""}">最新紀錄 <strong>${esc(fmt(latest.score))}</strong>${unit}</p><p class="chart-window">${dateMeaning} ${esc(dateLabel(latest.date))}</p></div><div class="plot-layout"><div class="chart-axis-y" aria-hidden="true"><span>${esc(fmt(max, 0))}</span><span>${esc(fmt((max + min) / 2, 0))}</span><span>${esc(fmt(min, 0))}</span></div><div class="plot-main"><div class="plot-area"><svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="${esc(`${label}，${dateMeaning} ${range}，最新 ${fmt(latest.score)} ${unit}`)}">${lines}${dots}</svg></div><div class="chart-axis-x" aria-hidden="true"><span>${esc(shortDate(rows[0].date))}</span><span>${rows.length > 2 ? esc(shortDate(middle.date)) : ""}</span><span>${rows.length > 1 ? esc(shortDate(rows.at(-1).date)) : ""}</span></div></div></div><p class="chart-caption">${esc(range)}。${kind === "radar" ? "橫軸為整理日，交易日另列於總覽。" : "橫軸為資料日。"}${rows.length === 1 ? "目前只有一筆紀錄。" : ""}</p>`;
  }

  function signed(value, suffix) {
    const result = number(value);
    return result === null ? "—" : `${result > 0 ? "+" : ""}${fmt(result, 2)}${suffix}`;
  }

  function renderChips() {
    const chips = isObject(state.temperature?.chips) ? state.temperature.chips : {};
    const dates = new Map();
    (Array.isArray(chips.institutional) ? chips.institutional : []).forEach((row) => {
      if (!isObject(row)) return;
      const date = dateKey(row.date);
      if (date) dates.set(date, { date, foreign: number(row.foreign), trust: number(row.trust), dealer: number(row.dealer) });
    });
    const days = [...dates.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    byId("chips-institutional").innerHTML = days.length ? `<p class="chips-intro">買賣超・單位：億元${days.length < 5 ? `・目前有 ${days.length} 個交易日資料` : ""}</p><div class="chips-day-list">${days.map((row) => `<article class="chips-day"><h3><time datetime="${row.date}">${esc(dateLabel(row.date))}</time></h3><dl class="chips-institution-values"><div><dt>外資</dt><dd>${esc(signed(row.foreign, ""))}</dd></div><div><dt>投信</dt><dd>${esc(signed(row.trust, ""))}</dd></div><div><dt>自營商</dt><dd>${esc(signed(row.dealer, ""))}</dd></div></dl></article>`).join("")}</div>` : `<p class="empty-state">尚未取得近5交易日的法人買賣超資料。</p>`;

    const futures = isObject(chips.foreignFutures) ? chips.foreignFutures : {};
    const net = number(futures.net), change = number(futures.change);
    const position = net === null ? "淨部位" : net < 0 ? "淨空單" : net > 0 ? "淨多單" : "淨部位";
    text("chips-futures-title", net === null ? "外資台指期淨空單" : `外資台指期${position}`);
    let direction = "";
    if (net !== null && change !== null) {
      const previous = net - change;
      if (change === 0) direction = "持平";
      else if (net < 0 && previous > 0) direction = "由淨多轉淨空";
      else if (net > 0 && previous < 0) direction = "由淨空轉淨多";
      else if (net === 0) direction = "轉為多空平衡";
      else if (previous === 0) direction = net < 0 ? "轉為淨空" : "轉為淨多";
      else direction = net < 0 ? change < 0 ? "淨空增加" : "淨空減少" : change > 0 ? "淨多增加" : "淨多減少";
    }
    byId("chips-futures").innerHTML = `<dl class="chips-result-grid"><div><dt>${position}</dt><dd>${net === null ? "—" : `${esc(fmt(Math.abs(net), 0))}<span class="chips-result-unit">口</span>`}</dd></div><div><dt>淨部位較前日</dt><dd>${change === null ? "—" : `${change > 0 ? "+" : ""}${esc(fmt(change, 0))}<span class="chips-result-unit">口</span>`}</dd>${direction ? `<p class="chips-direction">（${direction}）</p>` : ""}</div></dl><p class="chips-result-date">資料日：${dateKey(futures.asOf) ? esc(dateLabel(futures.asOf)) : "尚未取得"}</p>${net === null ? `<p class="chips-missing">尚未取得外資台指期淨部位。</p>` : ""}`;

  }

  function renderIndustry() {
    const rows = (Array.isArray(state.radar?.industry) ? state.radar.industry : []).filter(isObject).sort((a, b) => {
      const left = number(a.score), right = number(b.score);
      return left === null ? (right === null ? 0 : 1) : right === null ? -1 : right - left;
    }).slice(0, 10);
    text("industry-description", rows.length ? "只列資金分數前 10 個細產業。點開看產業變化。" : "目前沒有可用的產業排行。");
    byId("industry-list").innerHTML = rows.length ? rows.map((row, index) => {
      const id = `industry-detail-${index}`;
      return `<article class="industry-item"><button class="industry-toggle" type="button" aria-expanded="false" aria-controls="${id}" data-disclosure="${id}"><span class="industry-rank">${index + 1}</span><span class="industry-name">${esc(briefText(row.name, "未命名產業"))}</span><span class="industry-score">${esc(fmt(row.score))}</span><span class="disclosure-symbol" aria-hidden="true">＋</span></button><div class="industry-detail" id="${id}" hidden><dl class="detail-grid"><div><dt>產業資金分數</dt><dd>${esc(fmt(row.score))}${number(row.score) === null ? "" : " 分"}</dd></div><div><dt>前批分數差</dt><dd>${esc(signed(row.scoreChange, " 分"))}</dd></div><div><dt>平均產業日漲跌</dt><dd>${esc(signed(row.change, "%"))}</dd></div></dl><p class="detail-source">產業資料日：${esc(dateLabel(row.asOf ?? state.radar?.asOf))}</p></div></article>`;
    }).join("") : `<p class="empty-state">資料暫時無法提供，請稍後再查看。</p>`;
  }

  function renderHistory() {
    [["temperature", state.temperature, "大盤籌碼溫度"], ["radar", state.radar, "資金分數歷史"]].forEach(([kind, data, label]) => {
      const rows = records(data, kind);
      byId(`${kind}-history-chart`).innerHTML = chartMarkup(rows, label, kind, 120);
      const range = rows.length ? `${dateLabel(rows[0].date)}${rows.length > 1 ? ` 至 ${dateLabel(rows.at(-1).date)}` : ""}` : "尚無紀錄";
      text(`${kind}-history-dates`, `${kind === "radar" ? "整理期間" : "資料期間"}：${range}`);
      byId(`${kind}-history-records`).innerHTML = rows.length ? `<details class="history-records"><summary>查看每筆${kind === "radar" ? "整理" : "資料"}日期（${rows.length} 筆）</summary>${[...rows].reverse().map((row) => `<div class="history-row ${kind === "radar" ? "cyan" : ""}"><span>${esc(dateLabel(row.date))}</span><strong>${row.score === null ? "缺值" : `${esc(fmt(row.score))} ${kind === "temperature" ? "°C" : "分"}`}</strong></div>`).join("")}</details>` : "";
    });
  }

  function render() {
    renderOverview();
    renderNotices();
    byId("temperature-chart").innerHTML = chartMarkup(records(state.temperature, "temperature"), "溫度趨勢");
    renderChips();
    renderIndustry();
    renderHistory();
  }

  async function fetchData(path) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Unavailable data");
      const value = await response.json();
      if (!isObject(value)) throw new Error("Unavailable data");
      return value;
    } finally { clearTimeout(timer); }
  }

  async function load() {
    if (state.busy) return;
    state.busy = true;
    const button = byId("refresh-button");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    text("load-status", "正在讀取最新資料…");
    const keys = ["radar", "temperature"];
    const results = await Promise.allSettled([fetchData("./data/radar.json"), fetchData("./data/temperature.json")]);
    results.forEach((result, index) => {
      if (result.status === "fulfilled") { state[keys[index]] = result.value; delete state.errors[keys[index]]; }
      else state.errors[keys[index]] = true;
    });
    try {
      render();
      text("load-status", Object.keys(state.errors).length ? "部分資料暫時無法更新，請留意資料日。" : "資料已讀取，請以各項資料日為準。");
    } catch {
      text("load-status", "資料暫時無法顯示，請稍後刷新。");
    } finally {
      state.busy = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  function activateView(view, focus = false) {
    document.querySelectorAll("[data-view]").forEach((button) => {
      const selected = button.dataset.view === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      byId(`panel-${button.dataset.view}`).hidden = !selected;
      if (selected && focus) button.focus();
    });
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.view));
    button.addEventListener("keydown", (event) => {
      const tabs = [...document.querySelectorAll("[data-view]")], index = tabs.indexOf(button);
      let target;
      if (event.key === "ArrowRight") target = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") target = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === "Home") target = tabs[0];
      if (event.key === "End") target = tabs.at(-1);
      if (target) { event.preventDefault(); activateView(target.dataset.view, true); }
    });
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-disclosure]");
    if (!button) return;
    const panel = byId(button.dataset.disclosure);
    if (!panel) return;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    panel.hidden = !expanded;
    button.querySelector(".disclosure-symbol").textContent = expanded ? "−" : "＋";
  });
  byId("refresh-button").addEventListener("click", load);
  load();
})();
