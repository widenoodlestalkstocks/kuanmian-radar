"use strict";

(() => {
  const APP_VERSION = "20261116-24";
  const state = { radar: null, temperature: null, updateStatus: null, errors: {}, busy: false, view: "market", industryMode: "ranking", radarSelection: null, expandedIndustries: new Set(), globalFilter: "focus" };
  const byId = (id) => document.getElementById(id);
  let radarPlot = null, radarPlotObserver = null, radarLayoutFrame = null;
  function scheduleRadarClearance() {
    if (typeof requestAnimationFrame !== "function" || radarLayoutFrame !== null) return;
    radarLayoutFrame = requestAnimationFrame(() => {
      radarLayoutFrame = null;
      const plot = radarPlot;
      if (!plot || typeof plot.getBoundingClientRect !== "function") return;
      const bounds = plot.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      let topOverflow = 0, bottomOverflow = 0;
      plot.querySelectorAll(".radar-axis-label").forEach((label) => {
        const rect = label.getBoundingClientRect();
        topOverflow = Math.max(topOverflow, bounds.top - rect.top);
        bottomOverflow = Math.max(bottomOverflow, rect.bottom - bounds.bottom);
      });
      const top = `${Math.max(29, Math.ceil(topOverflow + 20))}px`;
      const bottom = `${Math.max(45, Math.ceil(bottomOverflow + 20))}px`;
      if (plot.style.marginTop !== top) plot.style.marginTop = top;
      if (plot.style.marginBottom !== bottom) plot.style.marginBottom = bottom;
    });
  }
  function observeRadarClearance() {
    radarPlotObserver?.disconnect();
    radarPlotObserver = null;
    radarPlot = byId("radar-comparison").querySelector?.(".radar-plot") ?? null;
    if (!radarPlot) return;
    if (typeof ResizeObserver === "function") {
      radarPlotObserver = new ResizeObserver(scheduleRadarClearance);
      radarPlotObserver.observe(radarPlot);
    }
    scheduleRadarClearance();
  }
  function setTheme(value, persist = false) {
    const theme = value === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    const button = byId("theme-toggle");
    button.dataset.theme = theme;
    button.setAttribute("aria-checked", String(theme === "dark"));
    button.setAttribute("aria-label", theme === "dark" ? "深色模式，切換為淺色" : "淺色模式，切換為深色");
    byId("theme-color").setAttribute("content", theme === "light" ? "#F5F1E9" : "#080A0B");
    if (persist) { try { localStorage.setItem("kuanmian-theme", theme); } catch {} }
  }
  setTheme(document.documentElement.dataset.theme);
  byId("theme-toggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
  function setTextSize(value, persist = false) {
    const size = value === "large" ? "large" : "standard";
    document.documentElement.dataset.textSize = size;
    const button = byId("font-size-toggle");
    if (button) {
      button.setAttribute("aria-pressed", String(size === "large"));
      button.setAttribute("aria-label", size === "large" ? "目前大字，切換為標準字" : "目前標準字，切換為大字");
      button.textContent = size === "large" ? "標準字" : "放大字";
    }
    if (persist) { try { localStorage.setItem("kuanmian-text-size", size); } catch {} }
    scheduleRadarClearance();
  }
  setTextSize(document.documentElement.dataset.textSize);
  byId("font-size-toggle")?.addEventListener("click", () => setTextSize(document.documentElement.dataset.textSize === "large" ? "standard" : "large", true));
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
  const overviewScore = (value) => {
    const result = number(value);
    return result !== null && result >= 0 && result <= 100 ? result : null;
  };
  const daysOld = (value) => {
    const date = dateKey(value);
    const today = dateKey(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
    return date && today ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000) : null;
  };
  const compiledLabel = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return "未提供";
    const instant = new Date(value);
    return Number.isFinite(instant.getTime()) ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant) : "未提供";
  };

  const fixedDisclosures = ["global-market-content", "chips-institutional", "chips-futures"];
  const nativeDetailIds = ["radar-picker", "temperature-history-details", "radar-history-details"];
  const handoffKey = "kuanmian-ui-handoff";
  let interactionSerial = 0, initialHandoff = null;
  if (typeof window !== "undefined") {
    ["wheel", "touchstart", "pointerdown", "keydown", "scroll"].forEach((event) => window.addEventListener(event, () => { interactionSerial++; }, { passive: true }));
  }
  function validPublicName(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 60 && !/[\r\n\t\u0000-\u001f]/.test(value);
  }
  function captureReadingState() {
    const disclosures = {}, nativeDetails = {};
    fixedDisclosures.forEach((id) => { disclosures[id] = byId(id)?.hidden === false; });
    nativeDetailIds.forEach((id) => { nativeDetails[id] = byId(id)?.open === true; });
    return { view: state.view, industryMode: state.industryMode, expandedIndustries: [...state.expandedIndustries].filter(validPublicName).slice(0, 10), radarSelection: Array.isArray(state.radarSelection) ? state.radarSelection.filter(validPublicName).slice(0, 5) : null, globalFilter: state.globalFilter, disclosures, nativeDetails, scrollY: typeof window === "undefined" ? 0 : Math.max(0, Math.min(1000000, Math.round(window.scrollY || 0))) };
  }
  function syncDisclosure(id, expanded) {
    const panel = byId(id);
    if (!panel) return;
    panel.hidden = !expanded;
    document.querySelectorAll("[data-disclosure]").forEach((button) => {
      if (button.dataset.disclosure !== id) return;
      button.setAttribute("aria-expanded", String(expanded));
      const symbol = button.querySelector?.(".disclosure-symbol");
      if (symbol) symbol.textContent = expanded ? "−" : "＋";
    });
  }
  function restorePanels(reading) {
    fixedDisclosures.forEach((id) => syncDisclosure(id, reading.disclosures?.[id] === true));
    nativeDetailIds.forEach((id) => { const detail = byId(id); if (detail) detail.open = reading.nativeDetails?.[id] === true; });
  }
  function validateHandoff(value, now = Date.now()) {
    if (!isObject(value) || value.schema !== 1 || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) || value.createdAt > now || now - value.createdAt > 600000 || !isObject(value.reading)) return null;
    const row = value.reading;
    if (!["market", "industry", "history"].includes(row.view) || !["ranking", "change", "radar"].includes(row.industryMode) || !["focus", "us", "asia", "fx", "all"].includes(row.globalFilter) || !Array.isArray(row.expandedIndustries) || row.expandedIndustries.length > 10 || row.expandedIndustries.some((name) => !validPublicName(name)) || (row.radarSelection !== null && (!Array.isArray(row.radarSelection) || row.radarSelection.length > 5 || row.radarSelection.some((name) => !validPublicName(name)))) || typeof row.scrollY !== "number" || !Number.isFinite(row.scrollY) || row.scrollY < 0 || row.scrollY > 1000000 || !isObject(row.disclosures) || !isObject(row.nativeDetails)) return null;
    if (Object.keys(row.disclosures).some((id) => !fixedDisclosures.includes(id)) || Object.keys(row.nativeDetails).some((id) => !nativeDetailIds.includes(id)) || [...Object.values(row.disclosures), ...Object.values(row.nativeDetails)].some((open) => typeof open !== "boolean")) return null;
    return { view: row.view, industryMode: row.industryMode, globalFilter: row.globalFilter, expandedIndustries: [...new Set(row.expandedIndustries)], radarSelection: row.radarSelection === null ? null : [...new Set(row.radarSelection)], scrollY: Math.round(row.scrollY), disclosures: Object.fromEntries(fixedDisclosures.map((id) => [id, row.disclosures[id] === true])), nativeDetails: Object.fromEntries(nativeDetailIds.map((id) => [id, row.nativeDetails[id] === true])) };
  }
  function readHandoff() {
    try {
      const value = sessionStorage.getItem(handoffKey);
      sessionStorage.removeItem(handoffKey);
      return typeof value === "string" && value.length <= 8192 ? validateHandoff(JSON.parse(value)) : null;
    } catch { return null; }
  }
  function saveHandoff() {
    try { sessionStorage.setItem(handoffKey, JSON.stringify({ schema: 1, createdAt: Date.now(), reading: captureReadingState() })); } catch {}
  }
  function focusDescriptor() {
    const active = document.activeElement;
    if (!active) return null;
    if (validPublicName(active.dataset?.industryName)) return { industry: active.dataset.industryName };
    if (active.dataset?.radarSelect !== undefined) {
      const name = industryRows()[Number(active.dataset.radarSelect)]?.name;
      if (validPublicName(name)) return { radar: name };
    }
    return typeof active.id === "string" && /^[a-z][a-z0-9-]{0,80}$/.test(active.id) ? { id: active.id } : null;
  }
  function restoreFocus(descriptor) {
    if (!descriptor) return;
    let target = descriptor.id ? byId(descriptor.id) : null;
    if (descriptor.industry) target = [...document.querySelectorAll("[data-industry-name]")].find((button) => button.dataset.industryName === descriptor.industry);
    if (descriptor.radar) target = [...document.querySelectorAll("[data-radar-select]")].find((button) => industryRows()[Number(button.dataset.radarSelect)]?.name === descriptor.radar);
    if (target && !target.hidden && !target.disabled) target.focus?.({ preventScroll: true });
  }
  function restorePosition(reading, focus, serial) {
    if (typeof window === "undefined" || interactionSerial !== serial) return;
    const restore = () => {
      if (interactionSerial !== serial) return;
      restoreFocus(focus);
      if (interactionSerial === serial) window.scrollTo?.({ top: reading.scrollY, behavior: "auto" });
      scheduleRadarClearance();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
    else restore();
  }

  function versionParts(value) {
    const match = typeof value === "string" ? value.match(/^(20\d{6})-(\d{1,4})$/) : null;
    if (!match || !dateKey(`${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`)) return null;
    return [Number(match[1]), Number(match[2])];
  }
  function newerVersion(candidate, current = APP_VERSION) {
    const left = versionParts(candidate), right = versionParts(current);
    return !!left && !!right && (left[0] > right[0] || (left[0] === right[0] && left[1] > right[1]));
  }
  function parseSiteVersion(html) {
    if (typeof html !== "string" || html.length > 262144) return null;
    const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const found = [];
    for (const match of markup.matchAll(/<meta\b[^>]*>/gi)) {
      const attributes = {}, duplicates = new Set();
      for (const attribute of match[0].matchAll(/\s([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(["'])(.*?)\2/g)) {
        const name = attribute[1].toLowerCase();
        if (Object.hasOwn(attributes, name)) duplicates.add(name);
        attributes[name] = attribute[3];
      }
      if (attributes.name === "kuanmian-ui-version") found.push(!duplicates.size && versionParts(attributes.content) ? attributes.content : null);
    }
    return found.length === 1 ? found[0] : null;
  }
  let versionBusy = false, versionCheckedAt = null, announcedVersion = null, dismissedVersion = null;
  function productionPage() {
    return typeof location !== "undefined" && location.protocol === "https:" && location.hostname === "widenoodlestalkstocks.github.io" && (!location.port || location.port === "443") && ["/kuanmian-radar/", "/kuanmian-radar/index.html"].includes(location.pathname);
  }
  async function checkSiteVersion(force = false) {
    const now = Date.now();
    if (!productionPage() || versionBusy || (!force && versionCheckedAt !== null && now - versionCheckedAt < 300000)) return;
    versionBusy = true;
    versionCheckedAt = now;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://widenoodlestalkstocks.github.io/kuanmian-radar/index.html?ui-check=${now}`, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: controller.signal });
      if (!response.ok || response.redirected) return;
      const candidate = parseSiteVersion(await response.text());
      if (candidate && newerVersion(candidate)) {
        announcedVersion = candidate;
        const notice = byId("version-notice");
        if (notice && candidate !== dismissedVersion) notice.hidden = false;
      }
    } catch {} finally { clearTimeout(timer); versionBusy = false; }
  }

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

  function overviewSignal(kind, score, observed) {
    const unavailable = (label) => ({ tone: "unavailable", label });
    if (score === null) return unavailable("資料不足");
    const age = daysOld(observed);
    if (!observed || age === null || age < 0 || age > 7) return unavailable("待更新");
    if (state.errors[kind] || state.errors.updateStatus) return unavailable("更新未完成");
    const component = state.updateStatus?.components?.[kind];
    if (component?.status === "failed") return unavailable("更新未完成");
    if (component?.status === "running") return unavailable("更新中");
    if (component?.status !== "success" || dateKey(component.asOf) !== observed) return unavailable("資料待確認");
    const signal = state[kind]?.signal;
    const tones = kind === "temperature" ? ["hot", "cold", "warm", "cool", "neutral", "caution", "danger"] : ["strong", "positive", "neutral", "weak", "risk"];
    if (!isObject(signal) || !tones.includes(signal.tone) || typeof signal.label !== "string" || !signal.label.trim() || signal.label.length > 12) return unavailable("資料待確認");
    return { tone: signal.tone, label: signal.label };
  }

  function applyOverviewSignal(kind, signal) {
    const card = byId(`${kind}-card`);
    card.dataset.signal = signal.tone;
    card.dataset.alert = String(["hot", "cold", "caution", "danger", "weak", "risk"].includes(signal.tone));
    card.setAttribute("aria-label", `${kind === "temperature" ? "大盤籌碼溫度" : "資金雷達總分"}：${signal.label}`);
    text(`${kind}-signal`, signal.label);
  }

  function renderOverview() {
    const latest = latestTemperature(), temperature = overviewScore(latest?.temperature);
    const radar = state.radar?.status === "unavailable" ? null : overviewScore(state.radar?.score);
    applyOverviewSignal("temperature", overviewSignal("temperature", temperature, temperatureDate()));
    applyOverviewSignal("radar", overviewSignal("radar", radar, dateKey(state.radar?.asOf)));
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
    if (byId("overview-source-date")) {
      const observed = dateKey(state.radar?.asOf), thermal = temperatureDate();
      text("overview-source-date", observed && thermal && observed === thermal ? `市場資料日：${dateLabel(observed)}` : `資金資料：${dateLabel(observed)}　籌碼資料：${dateLabel(thermal)}`);
    }
    byId("structure-card").innerHTML = temperature === null ? `<p class="empty-state">目前沒有可用的市場狀態。</p>` : `<p class="eyebrow">市場狀態</p><h3>${esc(marketState())}</h3>`;
  }

  function renderNotices() {
    const notices = [];
    [["temperature", "大盤籌碼溫度", state.temperature, temperatureDate()], ["radar", "資金雷達", state.radar, dateKey(state.radar?.asOf)]].forEach(([key, title, data, date]) => {
      const messages = [];
      const missing = key === "temperature" ? number(latestTemperature()?.temperature) === null : number(data?.score) === null;
      if (state.errors[key]) messages.push(data ? "暫時無法更新，目前保留上次讀取的結果。" : "資料暫時無法讀取，請稍後刷新。");
      if (state.updateStatus?.components?.[key]?.status === "failed") messages.push("最近一次更新未完成，目前顯示上次成功資料。");
      if (data && (data.status === "unavailable" || missing)) messages.push("部分資料不足，目前無法提供完整結果。");
      else if (data?.status === "partial") messages.push("部分資料不足，請留意結果與資料日。");
      if (date && daysOld(date) > 7) messages.push(`資料尚未更新，最新資料日為 ${dateLabel(date)}。`);
      if (data && !date) messages.push("資料日期尚未齊全，請稍後再查看。");
      if (messages.length) notices.push(`<div class="notice"><strong>${esc(title)}｜資料提醒</strong>${[...new Set(messages)].map((message) => `<p>${esc(message)}</p>`).join("")}</div>`);
    });
    if (state.errors.updateStatus) notices.push(`<div class="notice"><strong>更新狀態待確認</strong><p>暫時無法確認資料更新狀態，請稍後刷新。</p></div>`);
    byId("data-notices").innerHTML = notices.join("");
  }

  function renderHoldingReference() {
    const reference = state.temperature?.holdingReference;
    const sourceDate = temperatureDate();
    const referenceDate = dateKey(reference?.asOf);
    const health = overviewSignal("temperature", overviewScore(latestTemperature()?.temperature), sourceDate);
    const available = isObject(reference) && Number.isInteger(reference.percent) && reference.percent >= 0 && reference.percent <= 100 &&
      referenceDate !== null && referenceDate === sourceDate && health.tone !== "unavailable";
    byId("holding-reference-card").dataset.available = String(available);
    text("holding-reference-value", available ? `${fmt(reference.percent, 0)}%` : "—");
    text("holding-reference-date", `資料日：${dateLabel(available ? referenceDate : sourceDate)}`);
    text("holding-reference-status", health.tone === "unavailable" ? health.label : "暫無參考結果");
    byId("holding-reference-status").hidden = available;
  }

  function renderGlobalMarkets() {
    const order = ["wti", "gold", "vix", "sp500", "nasdaq", "sox", "taiex", "tpex", "nikkei", "kospi", "hangseng", "csi300", "shanghai", "dxy", "usdtwd"];
    const groups = ["焦點指標", "各國股市", "匯率"];
    const raw = Array.isArray(state.radar?.globalMarkets) ? state.radar.globalMarkets : [];
    const rows = order.flatMap((id) => {
      const matches = raw.filter((row) => isObject(row) && row.id === id);
      if (!matches.length) return [];
      const row = matches[0], observed = dateKey(row.asOf), age = daysOld(observed);
      const validDate = observed !== null && age !== null && age >= 0;
      const available = matches.length === 1 && ["available", "stale"].includes(row.status) && validDate &&
        typeof row.price === "number" && Number.isFinite(row.price) && row.price > 0 &&
        typeof row.changePct === "number" && Number.isFinite(row.changePct) && row.changePct >= -100;
      const sourceUrl = typeof row.sourceUrl === "string" && /^https:\/\/(?:finance\.yahoo\.com|finmind\.github\.io|www\.tpex\.org\.tw)\//.test(row.sourceUrl) ? row.sourceUrl : null;
      return [{ id, name: briefText(row.name, "市場指標").slice(0, 60), group: groups.includes(row.group) ? row.group : "焦點指標",
        unit: typeof row.unit === "string" ? row.unit.slice(0, 30) : "", asOf: validDate ? observed : null,
        price: available ? row.price : null, changePct: available ? row.changePct : null,
        stale: available && (row.status === "stale" || age > 7), sourceUrl }];
    });
    const available = rows.filter((row) => row.changePct !== null), stale = rows.filter((row) => row.stale);
    const scale = Math.max(1, Math.ceil(Math.max(0, ...available.map((row) => Math.abs(row.changePct)))));
    const filters = { focus: ["wti", "gold", "vix"], us: ["sp500", "nasdaq", "sox"], asia: ["taiex", "tpex", "nikkei", "kospi", "hangseng", "csi300", "shanghai"], fx: ["dxy", "usdtwd"], all: order };
    const filter = Object.hasOwn(filters, state.globalFilter) ? state.globalFilter : "focus";
    const visibleRows = rows.filter((row) => filters[filter].includes(row.id));
    document.querySelectorAll("[data-global-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.globalFilter === filter)));
    let status = rows.length ? `已取得 ${available.length} 項行情` : "全球市場資料尚未取得，請稍後刷新。";
    if (rows.length && available.length < rows.length) status += `，${rows.length - available.length} 項暫缺。`;
    else if (rows.length) status += "。";
    if (stale.length) status += ` ${stale.length} 項較久未更新，已標示原資料日。`;
    if (state.errors.radar || state.updateStatus?.components?.radar?.status === "failed") status += " 本次更新未完成，目前保留已保存行情。";
    else if (state.errors.updateStatus || !["success", "running"].includes(state.updateStatus?.components?.radar?.status)) status += " 更新狀態待確認，請留意各項資料日。";
    else if (state.updateStatus?.components?.radar?.status === "running") status += " 行情更新中，目前顯示已保存資料。";
    if (rows.length && filter !== "all") status += ` 本區顯示 ${visibleRows.length} 項。`;
    text("global-market-status", status);
    text("global-market-scale", available.length ? `長條中央為 0%，左右同一比例（±${fmt(scale, 0)}%）。紅漲綠跌，只表示價格變動。` : "缺資料以「—」標示，不視為持平。");
    byId("global-market-list").innerHTML = rows.length ? groups.map((group) => {
      const items = visibleRows.filter((row) => row.group === group);
      if (!items.length) return "";
      return `<section class="global-market-group"><h3>${esc(group)}</h3><div class="global-market-rows">${items.map((row) => {
        const direction = row.changePct === null ? "unavailable" : row.changePct > 0 ? "up" : row.changePct < 0 ? "down" : "flat";
        const symbol = direction === "up" ? "▲" : direction === "down" ? "▼" : direction === "flat" ? "—" : "";
        const change = row.changePct === null ? "—" : `${symbol} ${signed(row.changePct, "%")}`;
        const width = row.changePct === null ? 0 : Math.abs(row.changePct) / scale * 50;
        const left = row.changePct !== null && row.changePct < 0 ? 50 - width : 50;
        const bar = row.changePct === null ? `<div class="global-market-no-bar">行情暫缺</div>` : `<div class="global-market-bar" aria-hidden="true"><span class="global-market-zero"></span>${row.changePct === 0 ? `<span class="global-market-flat"></span>` : `<span class="global-market-fill" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%"></span>`}</div>`;
        const source = row.sourceUrl ? `<a class="global-market-source" href="${esc(row.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(row.name)}行情來源">來源 ↗</a>` : "";
        return `<article class="global-market-row" data-market="${row.id}" data-direction="${direction}"><div class="global-market-topline"><h4>${esc(row.name)}</h4><strong class="global-market-change" aria-label="${esc(row.changePct === null ? "最近一日漲跌未取得" : `最近一日漲跌 ${signed(row.changePct, "%")}`)}">${esc(change)}</strong></div>${bar}<div class="global-market-meta"><p class="global-market-value"><span class="sr-only">最新值 </span>${esc(fmt(row.price, 2))}${row.price === null ? "" : `<span>${esc(row.unit)}</span>`}</p><p class="global-market-date">資料日 <time${row.asOf ? ` datetime="${row.asOf}"` : ""}>${esc(row.asOf ? dateLabel(row.asOf) : "—")}</time>${row.stale ? `<span class="global-market-stale">待更新</span>` : ""}</p>${source}</div></article>`;
      }).join("")}</div></section>`;
    }).join("") : `<p class="empty-state">目前沒有可用的全球市場行情。</p>`;
  }

  function radarUpdateNote(compact = false) {
    const observed = dateKey(state.radar?.asOf), component = state.updateStatus?.components?.radar;
    if (!observed) return "目前沒有可確認日期的產業資料。";
    const saved = `${dateLabel(observed)} 已保存資料`;
    if (state.errors.radar) return `暫時無法讀取新資料，目前沿用 ${saved}。`;
    if (state.errors.updateStatus) return `更新狀態待確認，以下為 ${saved}。`;
    if (component?.status === "failed") return compact ? `更新未完成，沿用 ${shortDate(observed)} 資料。` : `本次更新未完成，以下為 ${saved}。`;
    if (component?.status === "running") return `資料更新中，以下為 ${saved}。`;
    if (daysOld(observed) > 7) return `資料尚待更新，以下為 ${saved}。`;
    if (component?.status !== "success" || dateKey(component?.asOf) !== observed) return `更新狀態待確認，以下為 ${saved}。`;
    return "";
  }

  function renderHighlights() {
    const observed = dateKey(state.radar?.asOf), kinds = ["score-rise", "score-fall", "price-score", "ranking-entry"];
    const rows = (Array.isArray(state.radar?.highlights) ? state.radar.highlights : []).filter((row) =>
      isObject(row) && kinds.includes(row.kind) && dateKey(row.asOf) === observed && observed &&
      typeof row.title === "string" && row.title.trim() && row.title.length <= 80 &&
      typeof row.detail === "string" && row.detail.trim() && row.detail.length <= 260).slice(0, 3);
    byId("latest-highlights").dataset.empty = String(rows.length === 0);
    byId("highlights-title").parentElement?.parentElement?.setAttribute("data-empty", String(rows.length === 0));
    text("highlights-date", rows.length ? `資料日：${dateLabel(observed)}` : "");
    text("highlights-status", radarUpdateNote() || (rows.length ? "從已保存的結果整理，每項變化都有數字可對照。" : "比較資料累積中，有前次紀錄後就會顯示變化。"));
    byId("highlight-list").innerHTML = rows.length ? rows.map((row, index) =>
      `<article class="highlight-row"><span class="highlight-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(row.title)}</h3><p>${esc(row.detail)}</p></div></article>`).join("") :
      "";
    byId("brief-industry-button").hidden = !rows.length;
  }

  function chartMarkup(input, label, kind = "temperature", limit = 60) {
    const rows = input.slice(-limit), valid = rows.filter((row) => row.score !== null);
    if (!valid.length) return `<p class="empty-state">目前沒有可用的${esc(label)}紀錄。</p>`;
    const latest = valid.at(-1), unit = kind === "temperature" ? "°C" : "分";
    const min = Math.floor(Math.min(0, ...valid.map((row) => row.score)) / 10) * 10;
    const max = Math.ceil(Math.max(100, ...valid.map((row) => row.score)) / 10) * 10;
    const stroke = kind === "temperature" ? "var(--chart-temperature)" : "var(--chart-radar)";
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

  function futuresMovement(net, change) {
    if (typeof net !== "number" || typeof change !== "number" || !Number.isFinite(net) || !Number.isFinite(change) || !Number.isFinite(net - change)) return "暫無可比資料";
    const previous = net - change, quantity = `${fmt(Math.abs(change), 0)}口`;
    if (change === 0) return "與前日持平";
    if (net < 0 && previous > 0) return "由淨多轉為淨空";
    if (net > 0 && previous < 0) return "由淨空轉為淨多";
    if (net === 0) return "轉為多空平衡";
    if (previous === 0) return `轉為${net < 0 ? "淨空單" : "淨多單"}${fmt(Math.abs(net), 0)}口`;
    return `${net < 0 ? "淨空單" : "淨多單"}${net < 0 ? change < 0 ? "增加" : "減少" : change > 0 ? "增加" : "減少"}${quantity}`;
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
    byId("chips-institutional").innerHTML = days.length ? `<p class="chips-intro">＋買超、－賣超，單位：億元${days.length < 5 ? `・目前有 ${days.length} 個交易日資料` : ""}</p><div class="chips-day-list">${days.map((row) => `<article class="chips-day"><h3><time datetime="${row.date}">${esc(dateLabel(row.date))}</time></h3><dl class="chips-institution-values"><div><dt>外資</dt><dd>${esc(signed(row.foreign, ""))}</dd></div><div><dt>投信</dt><dd>${esc(signed(row.trust, ""))}</dd></div><div><dt>自營商</dt><dd>${esc(signed(row.dealer, ""))}</dd></div></dl></article>`).join("")}</div>` : `<p class="empty-state">尚未取得近5交易日的法人買賣超資料。</p>`;

    const futures = isObject(chips.foreignFutures) ? chips.foreignFutures : {};
    const net = number(futures.net), change = number(futures.change);
    const position = net === null ? "淨部位" : net < 0 ? "淨空單" : net > 0 ? "淨多單" : "淨部位";
    text("chips-futures-title", net === null ? "外資台指期淨空單" : `外資台指期${position}`);
    byId("chips-futures").innerHTML = `<dl class="chips-result-grid"><div><dt>目前${position}</dt><dd>${net === null ? "—" : `${esc(fmt(Math.abs(net), 0))}<span class="chips-result-unit">口</span>`}</dd></div><div><dt>較前日變化</dt><dd class="chips-movement">${esc(futuresMovement(net, change))}</dd></div></dl><p class="chips-result-date">資料日：${dateKey(futures.asOf) ? esc(dateLabel(futures.asOf)) : "尚未取得"}</p>${net === null ? `<p class="chips-missing">尚未取得外資台指期淨部位。</p>` : ""}`;

  }

  function industryDeltaMarkup(row) {
    const value = overviewScore(row.score) === null ? null : number(row.scoreChange);
    const delta = value !== null && Math.abs(value) <= 100 ? Math.round(value * 100) / 100 : null;
    const direction = delta === null ? "missing" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const history = (Array.isArray(row.history) ? row.history : []).filter(isObject)
      .map((point) => dateKey(point.date)).filter((date) => date && date < dateKey(row.asOf ?? state.radar?.asOf));
    const previous = [...new Set(history)].sort().at(-1);
    const comparison = previous ? `較 ${shortDate(previous)}` : "較前次紀錄";
    const label = delta === null ? "比較資料不足" : `${comparison}${delta > 0 ? "上升" : delta < 0 ? "下降" : "持平"} ${fmt(Math.abs(delta), 2)} 分`;
    const symbol = direction === "up" ? "▲" : direction === "down" ? "▼" : "";
    const result = delta === null ? "待比較" : delta === 0 ? "持平 0" : signed(delta, "");
    return `<span class="industry-delta" data-direction="${direction}" aria-label="${esc(label)}" title="${esc(label)}">${symbol ? `<span aria-hidden="true">${symbol}</span>` : ""}<span aria-hidden="true">${esc(result)}</span></span>`;
  }

  function industryRows() {
    return (Array.isArray(state.radar?.industry) ? state.radar.industry : []).filter(isObject).sort((a, b) => {
      const left = number(a.score), right = number(b.score);
      return left === null ? (right === null ? 0 : 1) : right === null ? -1 : right - left;
    }).slice(0, 10).map((row, index) => ({ ...row, publicRank: index + 1 }));
  }

  function industryRankingMarkup(row) {
    const ranking = isObject(row.ranking) ? row.ranking : {};
    let label = "", status = "unavailable";
    if (ranking.status === "new") { label = "新進前10"; status = "new"; }
    else if (ranking.status === "continuing") {
      status = "continuing";
      const previous = number(ranking.previousRank), change = number(ranking.change);
      const comparable = Number.isInteger(previous) && previous >= 1 && previous <= 10 && Number.isInteger(change) && previous - row.publicRank === change;
      label = comparable && change !== 0 ? `續留前10・${change > 0 ? "升" : "降"}${Math.abs(change)}名` : "續留前10";
    }
    return label ? `<span class="industry-ranking" data-ranking="${status}">${esc(label)}</span>` : "";
  }

  function renderIndustry() {
    const rows = industryRows();
    state.expandedIndustries = new Set([...state.expandedIndustries].filter((name) => rows.some((row) => row.name === name)));
    const ordered = state.industryMode === "change" ? [...rows].sort((a, b) => {
      const left = number(a.scoreChange), right = number(b.scoreChange);
      return left === null ? (right === null ? a.publicRank - b.publicRank : 1) : right === null ? -1 : right - left || a.publicRank - b.publicRank;
    }) : rows;
    const modeText = state.industryMode === "change" ? "依資金分數升降排列；左側是本期名次。點開看已累積的走勢。" : "依資金分數排名。紅▲分數上升、綠▼分數下降，點開看變化。";
    text("industry-title", state.industryMode === "radar" ? "產業雷達比較" : state.industryMode === "change" ? "產業分數升降" : "細產業資金前 10");
    byId("industry-eyebrow").hidden = state.industryMode === "radar";
    text("industry-description", rows.length ? modeText : "目前沒有可用的產業排行。");
    byId("industry-description").hidden = state.industryMode === "radar";
    const comparisonPending = rows.length && rows.every((row) => number(row.scoreChange) === null);
    const updateNote = [radarUpdateNote(true), comparisonPending ? "比較資料累積中；有前次交易日紀錄後，會顯示分數升降與名次變化。" : ""].filter(Boolean).join(" ");
    text("industry-update-note", updateNote);
    byId("industry-update-note").hidden = !updateNote;
    ["ranking", "change", "radar"].forEach((mode) => byId(`industry-mode-${mode}`).setAttribute("aria-pressed", String(state.industryMode === mode)));
    byId("industry-list").hidden = state.industryMode === "radar";
    byId("industry-radar").hidden = state.industryMode !== "radar";
    byId("industry-list").innerHTML = ordered.length ? ordered.map((row) => {
      const id = `industry-detail-${row.publicRank - 1}`;
      const expanded = state.expandedIndustries.has(row.name);
      return `<article class="industry-item"><button class="industry-toggle" type="button" aria-expanded="${expanded}" aria-controls="${id}" data-disclosure="${id}" data-industry-name="${esc(row.name)}"><span class="industry-rank">${row.publicRank}</span><span class="industry-heading"><span class="industry-name">${esc(briefText(row.name, "未命名產業"))}</span>${industryRankingMarkup(row)}</span><span class="industry-metrics"><span class="industry-score" aria-label="${esc(`資金分數 ${fmt(row.score)} 分`)}">${esc(fmt(row.score))}<span class="industry-score-unit" aria-hidden="true">分</span></span>${industryDeltaMarkup(row)}</span><span class="disclosure-symbol" aria-hidden="true">${expanded ? "−" : "＋"}</span></button><div class="industry-detail" id="${id}"${expanded ? "" : " hidden"}>${industryTrendMarkup(row)}<dl class="detail-grid"><div><dt>產業資金分數</dt><dd>${esc(fmt(row.score))}${number(row.score) === null ? "" : " 分"}</dd></div><div><dt>資金分數較前次</dt><dd>${esc(signed(row.scoreChange, " 分"))}</dd></div><div><dt>產業平均日漲跌</dt><dd>${esc(signed(row.change, "%"))}</dd></div></dl><p class="detail-source">產業資料日：${esc(dateLabel(row.asOf ?? state.radar?.asOf))}</p></div></article>`;
    }).join("") : `<p class="empty-state">資料暫時無法提供，請稍後再查看。</p>`;
    renderIndustryRadar(rows);
  }

  function radarHistory(row, latest) {
    const points = new Map();
    (Array.isArray(row.history) ? row.history : []).filter(isObject).forEach((point) => {
      const day = dateKey(point.date);
      if (day && latest && day <= latest) points.set(day, overviewScore(point.score));
    });
    return points;
  }

  function renderIndustryRadar(rows) {
    const names = rows.map((row) => row.name);
    if (state.radarSelection === null) state.radarSelection = rows.slice(0, 5).map((row) => row.name);
    state.radarSelection = [...new Set(state.radarSelection)].filter((name) => names.includes(name)).slice(0, 5);
    const selected = rows.filter((row) => state.radarSelection.includes(row.name));
    byId("radar-selectors").innerHTML = rows.map((row, index) => {
      const active = state.radarSelection.includes(row.name), disabled = !active && selected.length >= 5;
      return `<button class="radar-selector" type="button" data-radar-select="${index}" aria-pressed="${active}"${disabled ? " disabled" : ""}><span aria-hidden="true">${active ? "✓" : "＋"}</span>${esc(briefText(row.name, "未命名產業"))}</button>`;
    }).join("");
    text("radar-selection-note", `已選 ${selected.length}／5 個產業。${selected.length >= 5 ? "先取消一個，就能換選別的產業。" : "點按產業名稱即可加入或取消。"}`);
    text("radar-picker-summary", `更換比較產業（已選${selected.length}）`);
    const latest = dateKey(state.radar?.asOf);
    const historical = selected.map((row) => radarHistory(row, latest));
    const previous = [...new Set(historical.flatMap((points) => [...points.keys()].filter((day) => day < latest)))].sort().at(-1) ?? null;
    const values = selected.map((row, index) => {
      const current = dateKey(row.asOf) === latest ? overviewScore(row.score) : null;
      const point = previous ? historical[index].get(previous) : null;
      const prior = overviewScore(point), change = number(row.scoreChange);
      const verified = current !== null && prior !== null && change !== null && Math.abs(Math.round((current - prior) * 100) / 100 - change) <= 1e-6;
      return { name: briefText(row.name, "未命名產業"), current, previous: verified ? prior : null };
    });
    const axisOrders = ["①", "②", "③", "④", "⑤"];
    const rowsMarkup = values.map((row, index) => `<tr><th scope="row"><span class="radar-table-order" aria-hidden="true">${axisOrders[index]} </span>${esc(row.name)}</th><td>${esc(fmt(row.current, 2))}</td><td>${esc(fmt(row.previous, 2))}</td></tr>`).join("");
    const legend = `<div class="radar-legend"><span><i class="radar-key-latest" aria-hidden="true"></i>最新 ${esc(shortDate(latest))}</span><span><i class="radar-key-previous" aria-hidden="true"></i>前次 ${esc(shortDate(previous))}</span><span>固定0–100分</span></div>`;
    let drawing = `<p class="radar-empty">${selected.length ? `再選 ${Math.max(0, 3 - selected.length)} 個產業，就能畫出比較圖。` : "先點選3–5個產業，開始比較。"}</p>`;
    if (selected.length >= 3 && latest) {
      const count = values.length, angle = (index) => -Math.PI / 2 + index / count * Math.PI * 2;
      const point = (index, radius) => ({ x: 50 + Math.cos(angle(index)) * radius, y: 50 + Math.sin(angle(index)) * radius });
      const vertices = (radius) => values.map((_, index) => point(index, radius)).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
      const grid = [20, 40, 60, 80, 100].map((value) => `<polygon points="${vertices(34 * value / 100)}"/>`).join("") + values.map((_, index) => { const p = point(index, 34); return `<line x1="50" y1="50" x2="${p.x.toFixed(3)}" y2="${p.y.toFixed(3)}"/>`; }).join("");
      const series = (key) => {
        const scores = values.map((row) => row[key]), valid = scores.map((score, index) => score === null ? null : point(index, 34 * score / 100));
        if (key === "previous" && valid.some((p) => p === null)) return "";
        const css = key === "current" ? "radar-series-latest" : "radar-series-previous";
        let paths = "";
        if (valid.every(Boolean)) paths = `<polygon class="${css}" points="${valid.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}" vector-effect="non-scaling-stroke"/>`;
        else {
          const start = valid.findIndex((p) => p === null), parts = []; let part = [];
          for (let n = 1; n <= count; n++) { const p = valid[(start + n) % count]; if (p) part.push(p); else { if (part.length > 1) parts.push(part); part = []; } }
          if (part.length > 1) parts.push(part);
          paths = parts.map((segment) => `<polyline class="${css}" points="${segment.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}" fill="none" vector-effect="non-scaling-stroke"/>`).join("");
        }
        return paths + valid.filter(Boolean).map((p) => `<circle class="${css}-point" cx="${p.x.toFixed(3)}" cy="${p.y.toFixed(3)}" r="1.05"/>`).join("");
      };
      const labels = values.map((row, index) => {
        const p = point(index, 44), safeWidth = Math.max(10, 2 * Math.min(p.x, 100 - p.x) - 1);
        return `<span class="radar-axis-label" style="left:${p.x.toFixed(3)}%;top:${p.y.toFixed(3)}%;max-width:min(88px,calc(${safeWidth.toFixed(3)}% + 16px));transform:translate(-50%,${p.y > 65 ? "0" : "-50%"})"><span class="radar-axis-name">${esc(row.name)}</span><span class="radar-axis-order" aria-hidden="true">${axisOrders[index]}</span></span>`;
      }).join("");
      const description = values.map((row) => `${row.name}最新${fmt(row.current, 2)}分，前次${fmt(row.previous, 2)}分`).join("；");
      drawing = `<div class="radar-plot"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(`產業分數比較，最新${dateLabel(latest)}，前次${dateLabel(previous)}。${description}`)}"><g class="radar-grid" aria-hidden="true">${grid}</g>${series("previous")}${series("current")}</svg>${labels}<span class="radar-scale-label radar-scale-zero" aria-hidden="true">0</span><span class="radar-scale-label radar-scale-top" aria-hidden="true">100</span></div>`;
    }
    byId("radar-comparison").innerHTML = selected.length ? `${legend}<p class="radar-large-note">圖上①～⑤，對照下方的產業名稱與分數。</p>${drawing}<table class="radar-values"><caption class="sr-only">所選產業的最新與前次分數</caption><thead><tr><th scope="col">產業</th><th scope="col">最新<br>${esc(shortDate(latest))}</th><th scope="col">前次<br>${esc(shortDate(previous))}</th></tr></thead><tbody>${rowsMarkup}</tbody></table><p class="radar-comparison-caption">同一批產業、同一個量尺比較。缺少可比紀錄以「—」顯示，圖上不補零。${values.some((row) => row.previous === null) ? "前次資料未齊，灰線暫不繪製；可用分數列在上方。" : ""}${values.some((row) => row.current === null) ? "部分最新分數不足，圖形不補點。" : ""}</p>` : drawing;
    observeRadarClearance();
  }

  function industryTrendMarkup(industry) {
    const observed = dateKey(industry.asOf ?? state.radar?.asOf), dates = new Map();
    (Array.isArray(industry.history) ? industry.history : []).forEach((row) => {
      if (!isObject(row)) return;
      const date = dateKey(row.date);
      if (date && observed && date <= observed) dates.set(date, { date, score: overviewScore(row.score) });
    });
    // A current, dated result remains a real observation while history builds.
    if (!dates.size && observed && overviewScore(industry.score) !== null) dates.set(observed, { date: observed, score: overviewScore(industry.score) });
    const rows = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
    const valid = rows.filter((row) => row.score !== null);
    const title = `<h3>近5個交易日資金分數</h3>`;
    if (!valid.length) return `<section class="industry-trend">${title}<p class="industry-trend-empty">資料正在累積，更新後會顯示走勢。</p></section>`;
    if (rows.length === 1 && valid.length === 1) return `<section class="industry-trend industry-trend-single"><h3>資金分數紀錄</h3><p class="industry-trend-single-value"><time datetime="${valid[0].date}">${esc(dateLabel(valid[0].date))}</time><strong class="industry-trend-single-score">${esc(fmt(valid[0].score))}分</strong></p><p class="industry-trend-caption">已累積1筆資料，後續逐日加入走勢。</p></section>`;
    const x = (index) => (index + 0.5) / rows.length * 100;
    const y = (score) => 100 - score;
    const segments = [];
    let segment = [];
    rows.forEach((row, index) => {
      if (row.score === null) { if (segment.length) segments.push(segment); segment = []; }
      else segment.push({ x: x(index), y: y(row.score) });
    });
    if (segment.length) segments.push(segment);
    const lines = segments.filter((part) => part.length > 1).map((part) => `<polyline class="industry-trend-line" points="${part.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" ")}" fill="none" vector-effect="non-scaling-stroke"/>`).join("");
    const dots = segments.flatMap((part) => part.map((point) => `<span class="industry-trend-point" style="left:${point.x.toFixed(3)}%;top:${point.y.toFixed(3)}%" aria-hidden="true"></span>`)).join("");
    const description = rows.map((row) => `${dateLabel(row.date)}：${row.score === null ? "缺資料" : `${fmt(row.score)}分`}`).join("，");
    const count = valid.length < 5 ? `已累積${valid.length}筆資料` : "5筆交易日紀錄";
    const values = rows.map((row) => `<div><dt><time datetime="${row.date}">${esc(shortDate(row.date))}</time></dt><dd>${esc(fmt(row.score))}<span class="sr-only">${row.score === null ? "缺資料" : "分"}</span></dd></div>`).join("");
    return `<section class="industry-trend">${title}<p class="industry-trend-meta"><span>${count}</span><span>0–100分</span></p><div class="industry-trend-plot"><div class="industry-trend-drawing"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(`資金分數走勢，${description}`)}"><g class="industry-trend-grid" aria-hidden="true">${[0, 50, 100].map((value) => `<line x1="0" y1="${value}" x2="100" y2="${value}" vector-effect="non-scaling-stroke"/>`).join("")}</g>${lines}</svg>${dots}</div></div><dl class="industry-trend-values" style="--trend-days:${rows.length}" aria-label="每日資金分數">${values}</dl><p class="industry-trend-caption">依已保存的交易日紀錄顯示。${valid.length < 5 ? "後續會逐日累積。" : ""}</p>${rows.some((row) => row.score === null) ? `<p class="industry-trend-gap">缺資料的日期以「—」標示。</p>` : ""}</section>`;
  }

  function renderHistory() {
    [["temperature", state.temperature, "大盤籌碼溫度"], ["radar", state.radar, "資金分數歷史"]].forEach(([kind, data, label]) => {
      const rows = records(data, kind);
      byId(`${kind}-history-chart`).innerHTML = `<p class="history-source-pair">市場資料日：${esc(dateLabel(kind === "temperature" ? temperatureDate() : data?.asOf))}<br>整理時間：${esc(compiledLabel(data?.generatedAt))}</p>${chartMarkup(rows, label, kind, 120)}`;
      const range = rows.length ? `${dateLabel(rows[0].date)}${rows.length > 1 ? ` 至 ${dateLabel(rows.at(-1).date)}` : ""}` : "尚無紀錄";
      text(`${kind}-history-dates`, `${kind === "radar" ? "整理期間" : "資料期間"}：${range}`);
      byId(`${kind}-history-records`).innerHTML = rows.length ? `<details id="${kind}-history-details" class="history-records"><summary>查看每筆${kind === "radar" ? "整理" : "資料"}日期（${rows.length} 筆）</summary>${[...rows].reverse().map((row) => `<div class="history-row ${kind === "radar" ? "cyan" : ""}"><span>${esc(dateLabel(row.date))}</span><strong>${row.score === null ? "缺值" : `${esc(fmt(row.score))} ${kind === "temperature" ? "°C" : "分"}`}</strong></div>`).join("")}</details>` : "";
    });
  }

  function render() {
    renderOverview();
    renderHoldingReference();
    renderGlobalMarkets();
    renderNotices();
    renderHighlights();
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
    const startedSerial = interactionSerial;
    state.busy = true;
    const button = byId("refresh-button");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    text("load-status", "正在讀取最新資料…");
    const keys = ["radar", "temperature", "updateStatus"];
    const results = await Promise.allSettled([fetchData("./data/radar.json"), fetchData("./data/temperature.json"), fetchData("./data/update-status.json")]);
    results.forEach((result, index) => {
      if (result.status === "fulfilled") { state[keys[index]] = result.value; delete state.errors[keys[index]]; }
      else state.errors[keys[index]] = true;
    });
    const reading = initialHandoff || captureReadingState(), focus = focusDescriptor();
    try {
      render();
      restorePanels(reading);
      activateView(state.view, false, false);
      text("load-status", Object.keys(state.errors).length ? "部分資料暫時無法更新，請留意資料日。" : "資料已讀取，以各區日期為準。");
    } catch {
      text("load-status", "資料暫時無法顯示，請稍後刷新。");
    } finally {
      state.busy = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      restorePosition(reading, focus, startedSerial);
      initialHandoff = null;
    }
  }

  function activateView(view, focus = false, scroll = true) {
    if (!["market", "industry", "history"].includes(view)) return;
    state.view = view;
    document.querySelectorAll("[data-view]").forEach((button) => {
      const selected = button.dataset.view === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      byId(`panel-${button.dataset.view}`).hidden = !selected;
      if (selected && focus) button.focus();
    });
    if (scroll) byId("view-navigation").scrollIntoView?.({ block: "start", behavior: "auto" });
    scheduleRadarClearance();
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
    const selector = event.target.closest("[data-radar-select]");
    if (selector) {
      const row = industryRows()[Number(selector.dataset.radarSelect)];
      if (!row || selector.disabled) return;
      if (state.radarSelection.includes(row.name)) state.radarSelection = state.radarSelection.filter((name) => name !== row.name);
      else if (state.radarSelection.length < 5) state.radarSelection.push(row.name);
      renderIndustryRadar(industryRows());
      byId("radar-selectors").querySelector?.(`[data-radar-select="${selector.dataset.radarSelect}"]`)?.focus?.();
      return;
    }
    const button = event.target.closest("[data-disclosure]");
    if (!button) return;
    const panel = byId(button.dataset.disclosure);
    if (!panel) return;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    panel.hidden = !expanded;
    button.querySelector(".disclosure-symbol").textContent = expanded ? "−" : "＋";
    const name = button.dataset.industryName;
    if (validPublicName(name)) {
      if (expanded) state.expandedIndustries.add(name);
      else state.expandedIndustries.delete(name);
    }
  });
  ["ranking", "change", "radar"].forEach((mode) => byId(`industry-mode-${mode}`).addEventListener("click", () => { state.industryMode = mode; renderIndustry(); }));
  byId("brief-industry-button").addEventListener("click", () => { state.industryMode = "change"; renderIndustry(); activateView("industry", true); });
  byId("refresh-button").addEventListener("click", () => {
    if (state.busy) return;
    const refreshed = load();
    void checkSiteVersion(true);
    return refreshed;
  });
  document.querySelectorAll("[data-global-filter]").forEach((button) => button.addEventListener("click", () => { state.globalFilter = button.dataset.globalFilter; renderGlobalMarkets(); }));
  byId("global-market-close")?.addEventListener("click", () => {
    syncDisclosure("global-market-content", false);
    byId("global-market-toggle").focus?.({ preventScroll: true });
    byId("global-market-toggle").scrollIntoView?.({ block: "start", behavior: "auto" });
  });
  byId("quick-industry-button")?.addEventListener("click", () => { state.industryMode = "ranking"; renderIndustry(); activateView("industry", true); });
  byId("quick-global-button")?.addEventListener("click", () => {
    activateView("market", false, false);
    syncDisclosure("global-market-content", true);
    byId("global-market-toggle").focus?.({ preventScroll: true });
    byId("global-market-toggle").scrollIntoView?.({ block: "start", behavior: "auto" });
  });
  byId("quick-chips-button")?.addEventListener("click", () => {
    activateView("market", false, false);
    syncDisclosure("chips-institutional", true);
    const toggle = [...document.querySelectorAll("[data-disclosure]")].find((button) => button.dataset.disclosure === "chips-institutional");
    toggle?.focus?.({ preventScroll: true });
    toggle?.scrollIntoView?.({ block: "start", behavior: "auto" });
  });
  byId("version-update-button")?.addEventListener("click", () => {
    if (!announcedVersion || !newerVersion(announcedVersion)) return;
    saveHandoff();
    if (typeof location !== "undefined") location.reload();
  });
  byId("version-dismiss-button")?.addEventListener("click", () => { dismissedVersion = announcedVersion; byId("version-notice").hidden = true; });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "hidden") void checkSiteVersion(); });
  if (typeof window !== "undefined") window.addEventListener("resize", scheduleRadarClearance);
  document.fonts?.ready?.then(scheduleRadarClearance);
  document.fonts?.addEventListener?.("loadingdone", scheduleRadarClearance);

  // Browser-only visitor counts; independent of market data and view changes.
  function startVisitorCounts() {
    const canonical = "https://widenoodlestalkstocks.github.io/kuanmian-radar/";
    const sourceLocation = typeof location === "undefined" ? null : location;
    const production = sourceLocation?.protocol === "https:" && sourceLocation.hostname === "widenoodlestalkstocks.github.io" && sourceLocation.pathname === "/kuanmian-radar/";
    if (!production) { text("visitor-status", "瀏覽統計僅於正式網站顯示"); return; }
    const encoded = encodeURIComponent(canonical);
    const historyUrl = `https://hitscounter.dev/api/history?url=${encoded}`;
    const hitUrl = `https://hitscounter.dev/api/hit?url=${encoded}&tz=Asia%2FTaipei&output=json`;
    let counted = false, busy = false, requestedDay = null, midnightTimer = null;
    const taipeiDay = () => {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const part = (type) => parts.find((item) => item.type === type).value;
      return `${part("year")}-${part("month")}-${part("day")}`;
    };
    const validCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const visible = () => document.visibilityState !== "hidden";
    const unknown = () => { text("visitor-total", "—"); text("visitor-today", "—"); };
    async function counterJson(url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Counter unavailable");
        const value = await response.json();
        if (!isObject(value)) throw new Error("Invalid counter data");
        return value;
      } finally { clearTimeout(timeout); }
    }
    function scheduleMidnight() {
      if (midnightTimer !== null) clearTimeout(midnightTimer);
      const next = Date.parse(`${taipeiDay()}T00:00:00+08:00`) + 86400000 + 50;
      midnightTimer = setTimeout(() => { midnightTimer = null; onVisible(); }, Math.max(50, next - Date.now()));
    }
    async function updateCounts(increment) {
      if (busy) return;
      busy = true;
      requestedDay = taipeiDay();
      unknown();
      text("visitor-status", "統計讀取中…");
      try {
        if (increment) {
          const hit = await counterJson(hitUrl);
          if (!validCount(hit.total_hits) || !validCount(hit.today_hits) || hit.total_hits < hit.today_hits) throw new Error("Invalid hit counts");
        }
        const data = await counterJson(historyUrl);
        if (!validCount(data.total_hits) || !Array.isArray(data.history)) throw new Error("Invalid counter history");
        let today = 0;
        data.history.forEach((row) => {
          const day = isObject(row) ? dateKey(row.hit_date) : null;
          if (!day || !validCount(row.hit_count)) throw new Error("Invalid daily count");
          if (day === requestedDay) today += row.hit_count;
        });
        if (!validCount(today) || data.total_hits < today) throw new Error("Inconsistent counts");
        if (requestedDay === taipeiDay()) {
          text("visitor-total", data.total_hits.toLocaleString("zh-TW"));
          text("visitor-today", today.toLocaleString("zh-TW"));
          text("visitor-status", `今日日期：${requestedDay.replace(/-/g, "/")}`);
        }
      } catch {
        unknown();
        text("visitor-status", "統計暫時無法讀取");
      } finally {
        busy = false;
        scheduleMidnight();
        if (visible() && requestedDay !== taipeiDay()) onVisible();
      }
    }
    function onVisible() {
      if (!visible() || busy) return;
      if (!counted) {
        // Set before sending: a timed-out hit may already have been recorded.
        counted = true;
        void updateCounts(true);
      } else if (requestedDay !== taipeiDay()) void updateCounts(false);
    }
    document.addEventListener("visibilitychange", onVisible);
    onVisible();
  }
  initialHandoff = readHandoff();
  if (initialHandoff) {
    state.view = initialHandoff.view;
    state.industryMode = initialHandoff.industryMode;
    state.globalFilter = initialHandoff.globalFilter;
    state.expandedIndustries = new Set(initialHandoff.expandedIndustries);
    state.radarSelection = initialHandoff.radarSelection;
    activateView(state.view, false, false);
  }
  load();
  void checkSiteVersion();
  startVisitorCounts();
})();
