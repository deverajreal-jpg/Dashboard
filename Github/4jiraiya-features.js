/* ============================================================
   4JIRAIYA · PREMIUM FEATURES PACK
   - Glowing-blue halo motif
   - Sparklines in KPI cards
   - Account card hover preview
   - Daily digest banner
   - Goal progress rings
   - Print/parchment PDF report
   - First-time onboarding
   ============================================================ */
(function(){
  'use strict';

  /* ── Wait for DATA + renderAll to exist ─────────────────── */
  function ready(cb){
    if(typeof window.renderAll === 'function'){ cb(); }
    else setTimeout(()=>ready(cb), 150);
  }

  // Closure-scoped cache of the latest data — needed because the
  // host page declares `let DATA` (not `window.DATA`), so any code
  // here that tried to read window.DATA was getting undefined.
  // Every render passes data to onDataRendered, which stashes it
  // here for hover preview, command palette, etc. to consume.
  let JR_DATA = null;
  function getData(){
    return JR_DATA || window.DATA || null;
  }

  /* ── Hook into renderAll so we run after every data render */
  ready(()=>{
    const orig = window.renderAll;
    window.renderAll = function(d){
      const r = orig.apply(this, arguments);
      try { onDataRendered(d); } catch(e){ console.warn('[premium] post-render', e); }
      return r;
    };
    // Also run once if data already loaded
    if(window.DATA) onDataRendered(window.DATA);
    // First-time onboarding (data-independent)
    maybeShowOnboarding();
  });

  /* ── Money formatter (fallback if global one not yet) ───── */
  function $$(n){
    if(typeof window.fmt$ === 'function') return window.fmt$(n);
    n = Number(n)||0;
    return '$' + n.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0});
  }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ───────────────────────────────────────────────────────
     1. DAILY DIGEST BANNER — top of dashboard
     ─────────────────────────────────────────────────────── */
  function renderDigest(data){
    const dash = document.getElementById('page-dashboard');
    if(!dash) return;
    let host = document.getElementById('jr-digest');
    if(!host){
      host = document.createElement('div');
      host.id = 'jr-digest';
      host.className = 'jr-digest';
      // Insert at the top of dash content
      const firstChild = dash.firstElementChild;
      if(firstChild) dash.insertBefore(host, firstChild);
      else dash.appendChild(host);
    }

    const accounts = (data.accounts||[]).filter(a=>!a.archived);
    const expenses = data.expenses||[];
    const flows    = data.cashFlow||[];
    const goals    = data.goals||[];
    const summary  = data.summary||{};

    const today = new Date(); today.setHours(0,0,0,0);
    const t0 = today.getTime();
    const t1 = t0 + 86400000;
    const w0 = t0 - 6*86400000;

    const parseD = (d) => {
      if(!d) return 0;
      const t = new Date(d).getTime();
      return isNaN(t) ? 0 : t;
    };

    // Sales today (status === 'Sold' AND soldDate today)
    const soldToday = accounts.filter(a => a.status === 'Sold' && parseD(a.soldDate||a.dateSold) >= t0 && parseD(a.soldDate||a.dateSold) < t1);
    const profitToday = soldToday.reduce((s,a)=>s + (Number(a.netProfit||a.profit||0)), 0);

    // 7d sales / profit
    const sold7 = accounts.filter(a => a.status === 'Sold' && parseD(a.soldDate||a.dateSold) >= w0);
    const profit7 = sold7.reduce((s,a)=>s + (Number(a.netProfit||a.profit||0)), 0);

    // Active counts
    const listed = accounts.filter(a => a.status === 'Listed').length;
    const building = accounts.filter(a => a.status === 'Building').length;
    const inventory = accounts.filter(a => a.status === 'Inventory').length;
    const banned = accounts.filter(a => a.status === 'Banned').length;

    // Goals on pace
    const netProfit = parseFloat(summary.netProfit) || 0;
    const activeGoals = goals.filter(g => !g.completed && g.active);
    const goalText = activeGoals.length
      ? `${activeGoals.length} goal${activeGoals.length===1?'':'s'} active · ${escapeHtml(activeGoals[0].name)} ${(Math.min(100, (netProfit/Math.max(1,activeGoals[0].target))*100)).toFixed(0)}%`
      : 'No active goals';

    const greeting = (() => {
      const h = new Date().getHours();
      if(h < 5) return 'Still grinding';
      if(h < 12) return 'Good morning';
      if(h < 17) return 'Good afternoon';
      if(h < 21) return 'Good evening';
      return 'Night shift';
    })();

    const todayStr = new Date().toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'});

    host.innerHTML = `
      <div class="jr-digest-inner">
        <div class="jr-digest-l">
          <div class="jr-digest-greet">${greeting}, jReal.</div>
          <div class="jr-digest-date">${todayStr}</div>
        </div>
        <div class="jr-digest-stats">
          <div class="jr-digest-stat">
            <span class="jr-digest-k">Today</span>
            <span class="jr-digest-v">${soldToday.length} sale${soldToday.length===1?'':'s'} · <b>${$$(profitToday)}</b></span>
          </div>
          <div class="jr-digest-stat">
            <span class="jr-digest-k">Last 7 days</span>
            <span class="jr-digest-v">${sold7.length} sale${sold7.length===1?'':'s'} · <b>${$$(profit7)}</b></span>
          </div>
          <div class="jr-digest-stat">
            <span class="jr-digest-k">Inventory</span>
            <span class="jr-digest-v"><span class="jr-inv-L">${listed}L</span> · <span class="jr-inv-B">${building}B</span> · <span class="jr-inv-I">${inventory}I</span>${banned?` · <span style="color:var(--jr-red)">${banned}✕</span>`:''}</span>
          </div>
          <div class="jr-digest-stat">
            <span class="jr-digest-k">Goals</span>
            <span class="jr-digest-v">${goalText}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ───────────────────────────────────────────────────────
     2. SPARKLINES inside KPI cards (7-day trend)
     ─────────────────────────────────────────────────────── */
  function buildDailySeries(accounts, days, valFn){
    const today = new Date(); today.setHours(0,0,0,0);
    const buckets = new Array(days).fill(0);
    accounts.forEach(a => {
      if(a.status !== 'Sold') return;
      const d = a.soldDate || a.dateSold;
      if(!d) return;
      const t = new Date(d); t.setHours(0,0,0,0);
      const idx = days - 1 - Math.floor((today - t)/86400000);
      if(idx >= 0 && idx < days) buckets[idx] += valFn(a);
    });
    return buckets;
  }

  function sparklinePath(values, w, h){
    if(!values.length) return '';
    const max = Math.max(1, ...values);
    const dx = w/(values.length-1 || 1);
    return values.map((v,i)=>{
      const x = i*dx;
      const y = h - (v/max)*h;
      return (i===0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  function injectSparkline(targetEl, values, color){
    if(!targetEl) return;
    targetEl.querySelector('.jr-spark')?.remove();
    if(!values.some(v=>v>0)) return;

    const w = 120, h = 28;
    const path = sparklinePath(values, w, h);
    const areaPath = path + ` L${w},${h} L0,${h} Z`;
    const last = values[values.length-1];
    const prev = values[values.length-2] || 0;
    const trend = last >= prev ? '▲' : '▼';
    const trendCol = last >= prev ? 'var(--jr-green)' : 'var(--jr-red)';
    const id = 'sp-' + Math.random().toString(36).slice(2,7);

    const wrap = document.createElement('div');
    wrap.className = 'jr-spark';
    wrap.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${color}" stop-opacity=".4"/>
            <stop offset="1" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#${id})"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <span class="jr-spark-trend" style="color:${trendCol}">${trend} 7d</span>
    `;
    targetEl.appendChild(wrap);
  }

  function renderSparklines(data){
    const accounts = (data.accounts||[]).filter(a=>!a.archived);
    // Net Profit card (#d-net) — 7-day profit
    const profitSeries = buildDailySeries(accounts, 7, a => Number(a.netProfit||a.profit||0));
    const salesSeries = buildDailySeries(accounts, 7, a => 1);
    const grossSeries = buildDailySeries(accounts, 7, a => Number(a.salePrice||a.soldPrice||0));

    // Find KPI cards by their value ID
    const map = [
      {id: 'd-net',      series: profitSeries, color: 'var(--jr-gold-200)'},
      {id: 'd-soldCount',series: salesSeries,  color: 'var(--jr-blue)'},
      {id: 'd-grossSales',series:grossSeries,  color: 'var(--jr-gold-300)'},
      {id: 'd-estSales', series: grossSeries,  color: 'var(--jr-purple)'}
    ];
    map.forEach(m => {
      const valEl = document.getElementById(m.id);
      if(!valEl) return;
      const card = valEl.closest('.stat-card');
      if(!card) return;
      // Resolve CSS var to real color
      const probe = document.createElement('span');
      probe.style.color = m.color;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      injectSparkline(card, m.series, c);
    });
  }

  /* ───────────────────────────────────────────────────────
     3. ACCOUNT CARD HOVER PREVIEW
     ─────────────────────────────────────────────────────── */
  let hoverCard = null;
  function ensureHoverCard(){
    if(hoverCard) return hoverCard;
    hoverCard = document.createElement('div');
    hoverCard.id = 'jr-hover-card';
    hoverCard.style.display = 'none';
    document.body.appendChild(hoverCard);
    return hoverCard;
  }

  function findAccount(name){
    const d = getData();
    if(!d) return null;
    return (d.accounts||[]).find(a => a.name === name);
  }

  function fmtDate(d){
    if(!d) return '—';
    try { return new Date(d).toLocaleDateString(undefined,{month:'short', day:'numeric'}); }
    catch(e){ return '—'; }
  }

  function showHoverCard(name, x, y){
    const a = findAccount(name);
    if(!a) return;
    const c = ensureHoverCard();
    const d = getData();

    // ── Money figures ────────────────────────────────────
    const expenses = (d?.expenses||[]).filter(e => e.account === name);
    const totalSpent = expenses.reduce((s,e)=>s + Number(e.amount||0), 0);
    const histAll = d?.priceHistory||[];
    const hist = histAll.filter(h => h.account === name);
    const askPrice = Number(a.askingPrice||a.salePrice||a.price||0);
    const soldPrice = Number(a.sold||0);
    const origPrice = Number(a.originalAskingPrice||a.origPrice||0);

    // ── Profit/Loss ──────────────────────────────────────
    let profit, profitLabel;
    if(a.status === 'Sold'){
      profit = soldPrice - totalSpent;
      profitLabel = 'Profit';
    } else if(a.status === 'Banned'){
      profit = -totalSpent;
      profitLabel = 'Loss';
    } else {
      profit = askPrice - totalSpent;
      profitLabel = 'Est. Profit';
    }

    // ── Dates / age ──────────────────────────────────────
    const ageDays = a.dateAdded ? Math.floor((Date.now() - new Date(a.dateAdded).getTime())/86400000) : null;
    const daysListed = a.postedDate ? Math.floor((Date.now() - new Date(a.postedDate).getTime())/86400000) : null;
    const daysBuilding = a.buildStartDate ? Math.floor((Date.now() - new Date(a.buildStartDate).getTime())/86400000) : null;

    // ── Membership countdown ─────────────────────────────
    const memActive = String(a.membership||'').toLowerCase() === 'yes';
    let memDaysLeft = null;
    if(memActive && a.membershipExpiry){
      memDaysLeft = Math.ceil((new Date(a.membershipExpiry).getTime() - Date.now())/86400000);
    }

    // ── Tags + proxy ─────────────────────────────────────
    const manualTags = Array.isArray(a.tags) ? a.tags : [];
    // Append skill-driven auto-tags from the cache (computed by the
    // same rules used to render auto-tag pills on cards). They show
    // up after manual tags so the manual ones stay first.
    const cachedSkills = (window.JR_SKILLS_CACHE || {})[name];
    let autoTagItems = [];
    if(cachedSkills && typeof window.JR_COMPUTE_AUTO_TAGS === 'function'){
      autoTagItems = window.JR_COMPUTE_AUTO_TAGS(cachedSkills);
    }
    const tags = manualTags.slice(); // for tag-row rendering below; auto-tags are rendered separately
    const proxy = a.proxy || null;

    // ── Combat / hiscores — read from already-rendered element
    //    if the data has been fetched. We don't trigger a fetch
    //    here; just surface what's already loaded. ───────────
    const cId = 'wom-' + name.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    const combatEl = document.getElementById('combat-' + cId);
    const combatText = combatEl ? combatEl.textContent.trim() : '';
    const hasCombat = combatText && combatText !== 'Loading…' && combatText !== 'Not on hiscores';

    // ── Full skills grid — show every skill in RS skills-tab order,
    //    not just pinned/99s. Levels are read from the host's hidden
    //    skill-cell elements (populated by fetchHiscores on render).
    //    Skills not on hiscores / level 1 render as "—" but keep their
    //    icon so the layout stays a consistent 3×8 grid.
    //    Order matches in-game stats tab:
    //      Atk Hit Min   Str Agi Smi   Def Her Fis   Ran Thi Coo
    //      Pra Cra Fir   Mag Fle Woo   Run Sla Far   Con Hun Sai
    const SKILL_ORDER = (typeof RS_SKILL_ORDER !== 'undefined') ? RS_SKILL_ORDER
      : (window.RS_SKILL_ORDER || ['attack','hitpoints','mining','strength','agility','smithing','defence','herblore','fishing','ranged','thieving','cooking','prayer','crafting','firemaking','magic','fletching','woodcutting','runecrafting','slayer','farming','construction','hunter','sailing']);
    const SI_MAP = (typeof SI !== 'undefined') ? SI : (window.SI || {});

    // Read levels from the card's hidden skills grid. Build a lookup
    // by full skill name (using sk-name 3-letter abbreviation → key).
    const ABBR_TO_KEY = (typeof RS_ABBR_TO_KEY !== 'undefined') ? RS_ABBR_TO_KEY
      : (window.RS_ABBR_TO_KEY || {});
    const skillLevels = {};
    const cardGrid = document.querySelector(`#${CSS.escape(cId)} .skills-grid`);
    if(cardGrid){
      cardGrid.querySelectorAll('.skill-cell').forEach(c => {
        const abbrEl = c.querySelector('.sk-name');
        const lvlEl = c.querySelector('.sk-lvl');
        if(!abbrEl || !lvlEl) return;
        const abbr = abbrEl.textContent.trim().toUpperCase();
        const key = ABBR_TO_KEY[abbr] || abbr.toLowerCase();
        const lvl = parseInt(lvlEl.textContent) || 0;
        skillLevels[key] = lvl;
      });
    }

    // Build the chip grid. Sailing isn't in OSRS yet — it always shows
    // as "—" but keeps a slot so the 3×8 layout reads correctly.
    let skillsStrip = '';
    if(hasCombat || Object.keys(skillLevels).length > 0){
      const fallbackIcon = 'https://oldschool.runescape.wiki/images/Stats_icon.png';
      skillsStrip = `<div class="jr-hc-skills">${SKILL_ORDER.map(s => {
        const lvl = skillLevels[s];
        const has = lvl && lvl > 1;
        const is99 = has && lvl >= 99;
        const display = has ? lvl : '—';
        const cls = `notable-skill jr-skill-cell${is99 ? ' is-99' : ''}${!has ? ' is-empty' : ''}`;
        const icon = SI_MAP[s] || fallbackIcon;
        return `<span class="${cls}"><img src="${icon}" onerror="this.style.display='none'"/>${display}</span>`;
      }).join('')}</div>`;
    }

    // ── Color tokens by status ──────────────────────────
    const statusKey = (a.status || 'Inventory').replace(/\s+/g,'');
    const statusTints = {
      'Inventory': '#7ab2db',
      'Building':  '#e89a5a',
      'Listed':    '#c09bd8',
      'Sold':      '#5fc485',
      'Banned':    '#d6534a'
    };
    const statusColor = statusTints[a.status] || '#b4ad9e';

    // ── Build the preview HTML ──────────────────────────
    const sec = (title, body) => body
      ? `<div class="jr-hc-sec"><div class="jr-hc-sec-t">${title}</div>${body}</div>`
      : '';

    const stat = (k, v, color) => `<div class="jr-hc-stat"><div class="jr-hc-k">${k}</div><div class="jr-hc-v"${color?` style="color:${color}"`:''}>${v}</div></div>`;

    // Money grid — what shows depends on status
    let moneyGrid = '';
    if(a.status === 'Sold'){
      moneyGrid = `
        <div class="jr-hc-grid">
          ${stat('Sold For', soldPrice ? $$(soldPrice) : '—')}
          ${stat('Spent', $$(totalSpent), 'var(--jr-red)')}
          ${stat(profitLabel, $$(profit), profit>=0?'var(--jr-green)':'var(--jr-red)')}
          ${stat('Sold On', a.dateSold ? fmtDate(a.dateSold) : '—')}
        </div>`;
    } else if(a.status === 'Banned'){
      moneyGrid = `
        <div class="jr-hc-grid">
          ${stat('Spent', $$(totalSpent), 'var(--jr-red)')}
          ${stat(profitLabel, $$(profit), 'var(--jr-red)')}
          ${stat('Banned', a.bannedDate ? fmtDate(a.bannedDate) : '—')}
          ${stat('Lifespan', ageDays!=null ? ageDays+'d' : '—')}
        </div>`;
    } else {
      moneyGrid = `
        <div class="jr-hc-grid">
          ${stat('Asking', askPrice ? $$(askPrice) : '—')}
          ${stat('Spent', $$(totalSpent), totalSpent>0?'var(--jr-red)':null)}
          ${stat(profitLabel, $$(profit), profit>=0?'var(--jr-green)':'var(--jr-red)')}
          ${stat('Age', ageDays!=null ? ageDays+'d' : '—')}
        </div>`;
    }

    // Status-specific timeline
    let timelineRows = '';
    if(a.status === 'Listed'){
      timelineRows += `<div class="jr-hc-row"><span>📅 Posted</span><span>${a.postedDate ? fmtDate(a.postedDate) : '—'}${daysListed!=null ? ` <span class="jr-hc-dim">(${daysListed}d ago)</span>` : ''}</span></div>`;
      if(origPrice && origPrice !== askPrice){
        const dropPct = origPrice ? ((origPrice - askPrice) / origPrice * 100) : 0;
        timelineRows += `<div class="jr-hc-row"><span>📉 Original</span><span><span class="jr-hc-strike">${$$(origPrice)}</span> <span style="color:var(--jr-orange,#e89a5a)">${dropPct>0?'-':'+'}${Math.abs(dropPct).toFixed(1)}%</span></span></div>`;
      }
      if(hist.length > 0){
        timelineRows += `<div class="jr-hc-row"><span>🔄 Price changes</span><span>${hist.length}</span></div>`;
      }
    } else if(a.status === 'Building'){
      timelineRows += `<div class="jr-hc-row"><span>🔨 Started</span><span>${a.buildStartDate ? fmtDate(a.buildStartDate) : '—'}${daysBuilding!=null ? ` <span class="jr-hc-dim">(${daysBuilding}d ago)</span>` : ''}</span></div>`;
    } else if(a.status === 'Inventory'){
      timelineRows += `<div class="jr-hc-row"><span>📦 Added</span><span>${a.dateAdded ? fmtDate(a.dateAdded) : '—'}${ageDays!=null ? ` <span class="jr-hc-dim">(${ageDays}d ago)</span>` : ''}</span></div>`;
    }

    // Membership row
    let memRow = '';
    if(a.status !== 'Banned' && a.status !== 'Sold'){
      if(memActive){
        const memColor = memDaysLeft!=null && memDaysLeft<=7 ? 'var(--jr-orange,#e89a5a)' : 'var(--jr-green,#5fc485)';
        memRow = `<div class="jr-hc-row"><span>🔑 Membership</span><span style="color:${memColor}">${memDaysLeft!=null ? memDaysLeft+'d left' : 'Active'}</span></div>`;
      } else {
        memRow = `<div class="jr-hc-row"><span>🔑 Membership</span><span style="color:var(--jr-text-3,#75705f)">Inactive</span></div>`;
      }
    }

    // Proxy row
    let proxyRow = '';
    if(proxy){
      proxyRow = `<div class="jr-hc-row"><span>🌐 Proxy</span><span class="jr-hc-mono">${escapeHtml(proxy)}</span></div>`;
    }

    // Source / launcher
    let sourceRows = '';
    if(a.launcher) sourceRows += `<div class="jr-hc-row"><span>🎮 Launcher</span><span>${escapeHtml(a.launcher)}</span></div>`;
    if(a.source) sourceRows += `<div class="jr-hc-row"><span>📌 Source</span><span>${escapeHtml(a.source)}</span></div>`;
    if(a.status === 'Sold' && a.soldPlatform) sourceRows += `<div class="jr-hc-row"><span>🏪 Platform</span><span>${escapeHtml(a.soldPlatform)}</span></div>`;
    if(a.status === 'Sold' && a.currencyPaid) sourceRows += `<div class="jr-hc-row"><span>💳 Paid in</span><span>${escapeHtml(a.currencyPaid)}</span></div>`;

    // Tags row — manual tags first (gray), then auto-tags. Standard
    // auto-tags follow (gold dot), then 99-tier tags last so the
    // glowing trophy row sits at the end of the tag list.
    let tagsRow = '';
    const manualPills = tags.map(t => `<span class="jr-hc-tag">${escapeHtml(t)}</span>`);
    const standardAuto = autoTagItems.filter(t => t.tier !== '99');
    const ninetyNineAuto = autoTagItems.filter(t => t.tier === '99');
    const standardAutoPills = standardAuto.map(t =>
      `<span class="jr-hc-tag jr-hc-auto-tag" title="Auto-tagged: ${escapeHtml(t.skill)} ${t.level}">${t.icon ? `<span class="jr-hc-auto-ic">${t.icon}</span>` : ''}${escapeHtml(t.tag)}</span>`
    );
    const ninetyNinePills = ninetyNineAuto.map(t =>
      `<span class="jr-hc-tag jr-hc-auto-tag jr-hc-auto-tag-99" title="${escapeHtml(t.skill)} 99">${t.iconUrl ? `<img class="jr-hc-99-ic" src="${t.iconUrl}" alt="" onerror="this.style.display='none'"/>` : ''}<span class="jr-hc-99-num">99</span></span>`
    );
    const allPills = manualPills.concat(standardAutoPills, ninetyNinePills);
    if(allPills.length){
      tagsRow = `<div class="jr-hc-tags">${allPills.join('')}</div>`;
    }

    // Description
    let descRow = '';
    if(a.desc){
      descRow = `<div class="jr-hc-desc">${escapeHtml(a.desc)}</div>`;
    }

    // Combat summary string ("Total: 282 · Combat: 3"), parsed from the
    // host's already-rendered combat element. We inline it next to the
    // type badge so the header reads "HCIM · Total: 282 · Combat: 3".
    let combatInline = '';
    if(hasCombat){
      combatInline = `<span class="jr-hc-combat-inline">📊 ${combatText}</span>`;
    }

    // (skillsStrip is built earlier as the full RS-tab grid)

    c.innerHTML = `
      <div class="jr-hc-head">
        <div class="jr-hc-name">${escapeHtml(a.name)}</div>
        <div class="jr-hc-status" style="color:${statusColor};border-color:${statusColor}">${escapeHtml(a.status||'—')}</div>
      </div>
      ${(a.type || combatInline || a.payoutStatus==='Pending') ? `<div class="jr-hc-type">
        ${a.type ? escapeHtml(a.type) : ''}
        ${combatInline}
        ${a.payoutStatus==='Pending' ? `<span class="jr-hc-pending">⏳ Payout Pending</span>` : ''}
      </div>` : ''}
      ${descRow}
      ${skillsStrip}
      ${tagsRow}
      ${(timelineRows || memRow || proxyRow) ? `<div class="jr-hc-rows">${timelineRows}${memRow}${proxyRow}</div>` : ''}
      ${sourceRows ? `<div class="jr-hc-rows jr-hc-rows-dim">${sourceRows}</div>` : ''}
      ${moneyGrid}
    `;

    c.style.display = 'block';
    // Position the preview so the entire content stays on screen.
    // Try (in order): below-right of cursor → above-right → below-left
    // → above-left → top-right anchored. Whichever fits first wins.
    const rect = c.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const GAP = 16;
    const margin = 8;

    const fitsRight  = (x + GAP + rect.width)  <= vw - margin;
    const fitsLeft   = (x - GAP - rect.width)  >= margin;
    const fitsBelow  = (y + GAP + rect.height) <= vh - margin;
    const fitsAbove  = (y - GAP - rect.height) >= margin;

    let px, py;
    if(fitsRight && fitsBelow){       px = x + GAP;             py = y + GAP; }
    else if(fitsRight && fitsAbove){  px = x + GAP;             py = y - GAP - rect.height; }
    else if(fitsLeft  && fitsBelow){  px = x - GAP - rect.width; py = y + GAP; }
    else if(fitsLeft  && fitsAbove){  px = x - GAP - rect.width; py = y - GAP - rect.height; }
    else {
      // Card is too tall to fit either above or below — anchor to top
      // edge and shift horizontally so it stays beside the cursor.
      px = (x + rect.width <= vw - margin) ? x + GAP : Math.max(margin, vw - rect.width - margin);
      py = margin;
    }
    c.style.left = Math.max(margin, Math.min(px, vw - rect.width - margin)) + 'px';
    c.style.top  = Math.max(margin, Math.min(py, vh - rect.height - margin)) + 'px';
  }

  function hideHoverCard(){
    if(hoverCard) hoverCard.style.display = 'none';
  }

  // Delegate hover events on .account-card → show #jr-hover-card.
  // 300ms delay so it doesn't pop up while the cursor is just passing
  // through. Track currently-hovered card by reference so we can ignore
  // noise from mouseover/mouseout firing on every child element.
  let lastHoveredCard = null;
  let hoverDelayTimer = null;
  const HOVER_DELAY_MS = 300;

  function isCollapsed(card){
    return card && !card.classList.contains('expanded') && !card.classList.contains('fully-expanded');
  }
  function getCardName(card){
    return card.dataset.name || card.dataset.accountName || card.querySelector('.ac-name')?.textContent?.trim() || null;
  }

  document.addEventListener('mouseover', e => {
    // Don't show hover preview while the stats modal (or any other modal) is open
    if(statsModalEl && statsModalEl.classList.contains('show')){
      if(lastHoveredCard){ lastHoveredCard = null; clearTimeout(hoverDelayTimer); hideHoverCard(); }
      return;
    }
    const card = e.target.closest('.account-card');
    if(!card){
      // Cursor not over any card — clear pending show + hide
      if(lastHoveredCard){
        lastHoveredCard = null;
        clearTimeout(hoverDelayTimer);
        hideHoverCard();
      }
      return;
    }
    if(!isCollapsed(card)){
      // Card is expanded — no preview needed
      if(lastHoveredCard){
        lastHoveredCard = null;
        clearTimeout(hoverDelayTimer);
        hideHoverCard();
      }
      return;
    }
    // Same card we're already showing? just update position (no re-show)
    if(card === lastHoveredCard && hoverCard && hoverCard.style.display === 'block'){
      const name = getCardName(card);
      if(name) showHoverCard(name, e.clientX, e.clientY);
      return;
    }
    // New card hovered — schedule a delayed show
    if(card !== lastHoveredCard){
      lastHoveredCard = card;
      clearTimeout(hoverDelayTimer);
      const name = getCardName(card);
      if(!name) return;
      const x = e.clientX, y = e.clientY;
      hoverDelayTimer = setTimeout(() => {
        // Only fire if cursor is still on the same card
        if(lastHoveredCard === card && document.body.contains(card)){
          showHoverCard(name, x, y);
        }
      }, HOVER_DELAY_MS);
    }
  });

  document.addEventListener('mousemove', e => {
    if(!hoverCard || hoverCard.style.display === 'none') return;
    const card = e.target.closest('.account-card');
    if(card && card === lastHoveredCard && isCollapsed(card)){
      const name = getCardName(card);
      if(name) showHoverCard(name, e.clientX, e.clientY);
    } else if(!card){
      lastHoveredCard = null;
      clearTimeout(hoverDelayTimer);
      hideHoverCard();
    }
  });

  // Catch the case where the mouse leaves the document entirely
  document.addEventListener('mouseleave', () => {
    lastHoveredCard = null;
    clearTimeout(hoverDelayTimer);
    hideHoverCard();
  });

  /* ───────────────────────────────────────────────────────
     4. GOAL PROGRESS RINGS (alongside the bar)
     ─────────────────────────────────────────────────────── */
  function renderGoalRing(data){
    // Wait for goal-panel-body to be rendered by the existing code
    const body = document.getElementById('goal-panel-body');
    if(!body) return;
    const featured = body.querySelector('.goal-featured');
    if(!featured) return;
    if(featured.querySelector('.jr-goal-ring')) return; // already added

    const goals = (data.goals||[]).filter(g => !g.completed && g.active);
    if(!goals.length) return;
    const g = goals[0];
    const netProfit = parseFloat((data.summary||{}).netProfit) || 0;
    const pct = g.target>0 ? Math.max(0, Math.min(1, netProfit/g.target)) : 0;

    const r = 32, c = 2*Math.PI*r;
    const dash = (c * pct).toFixed(2);
    const ring = document.createElement('div');
    ring.className = 'jr-goal-ring';
    ring.innerHTML = `
      <svg viewBox="0 0 80 80" width="76" height="76">
        <defs>
          <linearGradient id="jr-ring-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff0b8"/>
            <stop offset="1" stop-color="#c8972a"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="rgba(200,151,42,.15)" stroke-width="6"/>
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="url(#jr-ring-grad)" stroke-width="6"
                stroke-linecap="round" stroke-dasharray="${dash} ${c}"
                transform="rotate(-90 40 40)" style="filter:drop-shadow(0 0 4px rgba(240,185,58,.5))"/>
        <text x="40" y="44" text-anchor="middle" font-family="Cinzel, serif" font-size="14" fill="var(--jr-gold-200)" font-weight="600">${(pct*100).toFixed(0)}%</text>
      </svg>
    `;
    // Insert ring at the front of featured
    featured.style.display = 'flex';
    featured.style.gap = '16px';
    featured.style.alignItems = 'center';
    const wrap = document.createElement('div');
    wrap.style.flex = '1';
    while(featured.firstChild) wrap.appendChild(featured.firstChild);
    featured.appendChild(ring);
    featured.appendChild(wrap);
  }

  /* ───────────────────────────────────────────────────────
     5. PRINT/EXPORT PARCHMENT REPORT
     ─────────────────────────────────────────────────────── */
  function buildReport(){
    const d = getData();
    if(!d){ alert('No data loaded yet — refresh first.'); return; }
    const accounts = (d.accounts||[]).filter(a=>!a.archived);
    const expenses = d.expenses||[];
    const goals = d.goals||[];
    const summary = d.summary||{};

    const today = new Date(); today.setHours(0,0,0,0);
    const w0 = today.getTime() - 6*86400000;
    const parseD = (x)=>{ const t = x?new Date(x).getTime():0; return isNaN(t)?0:t; };
    const sold7 = accounts.filter(a => a.status==='Sold' && parseD(a.soldDate||a.dateSold) >= w0);
    const profit7 = sold7.reduce((s,a)=>s+Number(a.netProfit||a.profit||0),0);
    const gross7 = sold7.reduce((s,a)=>s+Number(a.salePrice||a.soldPrice||0),0);

    const listed = accounts.filter(a=>a.status==='Listed');
    const building = accounts.filter(a=>a.status==='Building');
    const banned = accounts.filter(a=>a.status==='Banned');

    const dateStr = new Date().toLocaleDateString(undefined,{weekday:'long', year:'numeric', month:'long', day:'numeric'});

    const win = window.open('', '_blank', 'width=900,height=1200');
    if(!win){ alert('Popup blocked — allow popups to print the report.'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>4Jiraiya · Weekly Brief</title>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        @page { size: letter; margin: 0.6in; }
        *{box-sizing:border-box}
        body{
          font-family:'Inter',sans-serif; color:#3a2914; background:#f4ecd8; margin:0; padding:32px 36px;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          background-blend-mode:multiply;
        }
        .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #8a6315;padding-bottom:14px;margin-bottom:24px}
        .brand{font-family:'Cinzel',serif;letter-spacing:.2em;font-size:22px;color:#5d3f0a}
        .tag{font-family:'Cinzel',serif;font-size:9px;letter-spacing:.3em;color:#8a6315;text-transform:uppercase;margin-top:4px}
        .meta{font-family:'Cinzel',serif;font-size:10px;letter-spacing:.18em;color:#8a6315;text-transform:uppercase;text-align:right}
        .meta b{display:block;font-size:11px;color:#3a2914;margin-top:2px}
        h2{font-family:'Cinzel',serif;font-size:11px;letter-spacing:.22em;color:#8a6315;text-transform:uppercase;margin:22px 0 8px;border-bottom:1px solid rgba(108,78,26,.25);padding-bottom:6px;display:flex;align-items:center;gap:10px}
        h2::before{content:'';display:inline-block;width:18px;height:8px;background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 36 16%27><ellipse cx=%2718%27 cy=%278%27 rx=%2714%27 ry=%273%27 fill=%27none%27 stroke=%27%238a6315%27 stroke-width=%271.4%27/></svg>") center/contain no-repeat}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:6px}
        .stat{border:1px solid rgba(108,78,26,.3);background:rgba(255,255,255,.4);padding:14px;border-radius:8px}
        .stat .k{font-family:'Cinzel',serif;font-size:9px;letter-spacing:.2em;color:#8a6315;text-transform:uppercase}
        .stat .v{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:28px;color:#3a2914;margin-top:6px;font-weight:600;font-variant-numeric:tabular-nums}
        table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}
        th{font-family:'Cinzel',serif;font-size:9.5px;letter-spacing:.18em;color:#8a6315;text-transform:uppercase;text-align:left;padding:8px 10px;border-bottom:1px solid #8a6315}
        td{padding:8px 10px;border-bottom:1px dashed rgba(108,78,26,.18);font-variant-numeric:tabular-nums}
        td.r{text-align:right}
        .foot{margin-top:30px;text-align:center;font-family:'Cinzel',serif;font-size:9px;letter-spacing:.4em;color:#8a6315;text-transform:uppercase;border-top:1px solid rgba(108,78,26,.3);padding-top:12px}
        .foot::before, .foot::after{content:'◆';margin:0 12px;color:#b78a1f}
        .pill{display:inline-block;font-family:'Cinzel',serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:3px 8px;border-radius:3px;border:1px solid currentColor}
        @media print{ body{background:#fbf3df;-webkit-print-color-adjust:exact;print-color-adjust:exact} .noprint{display:none} }
      </style></head><body>
      <div class="head">
        <div>
          <div class="brand">4 J I R A I Y A</div>
          <div class="tag">One Life × One Legacy · Weekly Brief</div>
        </div>
        <div class="meta">As of<b>${dateStr}</b></div>
      </div>

      <h2>Snapshot · Last 7 Days</h2>
      <div class="grid">
        <div class="stat"><div class="k">Net Profit (lifetime)</div><div class="v">${$$(parseFloat(summary.netProfit)||0)}</div></div>
        <div class="stat"><div class="k">Profit · 7d</div><div class="v">${$$(profit7)}</div></div>
        <div class="stat"><div class="k">Gross Sales · 7d</div><div class="v">${$$(gross7)}</div></div>
        <div class="stat"><div class="k">Sales Count · 7d</div><div class="v">${sold7.length}</div></div>
      </div>

      <h2>Active Inventory</h2>
      <div class="grid">
        <div class="stat"><div class="k">Listed</div><div class="v">${listed.length}</div></div>
        <div class="stat"><div class="k">Building</div><div class="v">${building.length}</div></div>
        <div class="stat"><div class="k">Inventory</div><div class="v">${accounts.filter(a=>a.status==='Inventory').length}</div></div>
        <div class="stat"><div class="k">Banned</div><div class="v">${banned.length}</div></div>
      </div>

      <h2>Goals on the Path</h2>
      ${goals.filter(g=>!g.completed && g.active).slice(0,4).map(g => {
        const np = parseFloat(summary.netProfit)||0;
        const pct = Math.max(0, Math.min(100, (np/Math.max(1,g.target))*100));
        return `<div style="margin:10px 0">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><b>${escapeHtml(g.name)}</b><span>${$$(Math.min(np,g.target))} / ${$$(g.target)} · ${pct.toFixed(0)}%</span></div>
          <div style="height:8px;background:rgba(108,78,26,.15);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#c8972a,#8a6315)"></div>
          </div>
        </div>`;
      }).join('') || '<div style="color:#8a6315;font-style:italic;font-size:12px">No active goals.</div>'}

      <h2>Recent Sales · Last 7 Days</h2>
      <table>
        <thead><tr><th>Account</th><th>Status</th><th class="r">Sold For</th><th class="r">Net Profit</th><th>Date</th></tr></thead>
        <tbody>
          ${sold7.length ? sold7.slice(0,15).map(a=>`
            <tr>
              <td>${escapeHtml(a.name)}</td>
              <td><span class="pill" style="color:#2d8a51">SOLD</span></td>
              <td class="r">${$$(Number(a.salePrice||a.soldPrice||0))}</td>
              <td class="r"><b>${$$(Number(a.netProfit||a.profit||0))}</b></td>
              <td>${fmtDate(a.soldDate||a.dateSold)}</td>
            </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:#8a6315;padding:14px;font-style:italic">No sales recorded in the last 7 days.</td></tr>`}
        </tbody>
      </table>

      <h2>Currently Listed</h2>
      <table>
        <thead><tr><th>Account</th><th class="r">Asking</th><th>Listed</th></tr></thead>
        <tbody>
          ${listed.length ? listed.slice(0,12).map(a=>`
            <tr>
              <td>${escapeHtml(a.name)}</td>
              <td class="r">${$$(Number(a.askingPrice||a.salePrice||0))}</td>
              <td>${fmtDate(a.dateListed||a.dateAdded)}</td>
            </tr>`).join('') : `<tr><td colspan="3" style="text-align:center;color:#8a6315;padding:14px;font-style:italic">Nothing listed.</td></tr>`}
        </tbody>
      </table>

      <div class="foot">One Life × One Legacy</div>
      <div class="noprint" style="position:fixed;top:14px;right:14px">
        <button onclick="window.print()" style="font-family:'Cinzel',serif;background:linear-gradient(180deg,#c8972a,#6b4d12);color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 14px rgba(108,78,26,.3)">Print / Save PDF</button>
      </div>
    </body></html>`);
    win.document.close();
  }
  window.JR_PRINT_REPORT = buildReport;

  /* ───────────────────────────────────────────────────────
     6. ONBOARDING (first-time)
     ─────────────────────────────────────────────────────── */
  function maybeShowOnboarding(){
    try {
      if(localStorage.getItem('jr_onboarded')) return;
    } catch(e){ return; }

    const wrap = document.createElement('div');
    wrap.id = 'jr-onboard';
    wrap.innerHTML = `
      <div class="jr-onb-card">
        <button class="jr-onb-close" aria-label="Close">×</button>
        <div class="jr-onb-avatar"></div>
        <div class="jr-onb-eyebrow">One Life × One Legacy</div>
        <h2 class="jr-onb-title">Welcome to the Command Deck.</h2>
        <p class="jr-onb-sub">Your operations have been honored with a war room. Here's how to wield it.</p>

        <div class="jr-onb-steps">
          <div class="jr-onb-step">
            <div class="jr-onb-num">I</div>
            <div>
              <div class="jr-onb-h">Connect the Ledger</div>
              <div class="jr-onb-t">Open <b>Setup</b> to paste your Apps Script URL. The deck will pull your accounts, expenses, and cash flow.</div>
            </div>
          </div>
          <div class="jr-onb-step">
            <div class="jr-onb-num">II</div>
            <div>
              <div class="jr-onb-h">Summon the Palette</div>
              <div class="jr-onb-t">Press <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> to jump anywhere — pages, accounts, actions.</div>
            </div>
          </div>
          <div class="jr-onb-step">
            <div class="jr-onb-num">III</div>
            <div>
              <div class="jr-onb-h">Choose Your Aura</div>
              <div class="jr-onb-t">Toggle dark / parchment in the topbar, or with <kbd>⌘⇧L</kbd>.</div>
            </div>
          </div>
          <div class="jr-onb-step">
            <div class="jr-onb-num">IV</div>
            <div>
              <div class="jr-onb-h">Stake a Goal</div>
              <div class="jr-onb-t">From Dashboard, tap <b>Add Goal</b> — set a Net Profit target and the deck forecasts your path.</div>
            </div>
          </div>
        </div>

        <div class="jr-onb-actions">
          <button class="jr-onb-skip">Skip</button>
          <button class="jr-onb-go">Begin · Open Setup</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    requestAnimationFrame(()=>wrap.classList.add('show'));

    const close = (goSetup)=>{
      wrap.classList.remove('show');
      try{ localStorage.setItem('jr_onboarded','1'); }catch(e){}
      setTimeout(()=>wrap.remove(), 380);
      if(goSetup){
        const tab = document.querySelector('.nav-tab[onclick*="\'setup\'"]');
        if(tab) tab.click();
      }
    };
    wrap.querySelector('.jr-onb-close').addEventListener('click', ()=>close(false));
    wrap.querySelector('.jr-onb-skip').addEventListener('click', ()=>close(false));
    wrap.querySelector('.jr-onb-go').addEventListener('click', ()=>close(true));
    wrap.addEventListener('click', e => { if(e.target===wrap) close(false); });
  }
  window.JR_REPLAY_ONBOARDING = function(){
    try{ localStorage.removeItem('jr_onboarded'); }catch(e){}
    maybeShowOnboarding();
  };

  /* ───────────────────────────────────────────────────────
     7. FULL-STATS MODAL (📊 button on each card)
     Replaces the inline "Show full stats" expander for the
     workflow view. Opens a centered modal with the OSRS
     hiscores grid where skills can be clicked to pin them
     as gold highlights on the card. Re-uses the host page's
     SKILLS / SI / pinnedSkills / togglePinnedSkill so pins
     stay synced with the existing system.
     ─────────────────────────────────────────────────────── */
  let statsModalEl = null;

  function ensureStatsModal(){
    if(statsModalEl) return statsModalEl;
    statsModalEl = document.createElement('div');
    statsModalEl.id = 'jr-stats-modal';
    statsModalEl.innerHTML = `
      <div class="jr-sm-card" role="dialog" aria-labelledby="jr-sm-name">
        <div class="jr-sm-head">
          <div class="jr-sm-head-l">
            <div class="jr-sm-name" id="jr-sm-name">—</div>
            <div class="jr-sm-sub">OSRS Hiscores · click a skill to pin it as a card highlight</div>
          </div>
          <button class="jr-sm-close" aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        <div class="jr-sm-summary" id="jr-sm-summary"></div>
        <div class="jr-sm-grid" id="jr-sm-grid"></div>
        <div class="jr-sm-foot">
          <span class="jr-sm-foot-tag">⚔ ONE LIFE × ONE LEGACY</span>
          <span class="jr-sm-foot-hint">Esc to close</span>
        </div>
      </div>
    `;
    document.body.appendChild(statsModalEl);
    statsModalEl.addEventListener('click', e => { if(e.target === statsModalEl) closeStatsModal(); });
    statsModalEl.querySelector('.jr-sm-close').addEventListener('click', closeStatsModal);
    return statsModalEl;
  }

  function closeStatsModal(){
    if(statsModalEl) statsModalEl.classList.remove('show');
  }

  // Esc to close
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && statsModalEl && statsModalEl.classList.contains('show')){
      e.preventDefault();
      closeStatsModal();
    }
  });

  async function openStatsModal(name){
    const m = ensureStatsModal();
    const a = findAccount(name);
    const cId = 'wom-' + name.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');

    m.querySelector('#jr-sm-name').textContent = name;
    m.querySelector('#jr-sm-summary').innerHTML = `<div class="jr-sm-loading">⏳ Loading hiscores…</div>`;
    m.querySelector('#jr-sm-grid').innerHTML = '';
    m.classList.add('show');

    // Re-use the existing fetchHiscores network call by hitting the same
    // endpoint directly — but render into the modal's containers instead
    // of the card's hidden detail panel.
    try{
      const getUrlFn = window.getUrl;
      if(typeof getUrlFn !== 'function') throw new Error('Sheet URL not configured');
      const url = getUrlFn() + '?action=hiscores&rsn=' + encodeURIComponent(name);
      const res = await fetch(url);
      const json = await res.json();
      if(!json.ok || !json.skills) throw new Error('Not on hiscores');
      renderStatsModal(name, cId, json.skills, a);
    } catch(err){
      m.querySelector('#jr-sm-summary').innerHTML = '';
      m.querySelector('#jr-sm-grid').innerHTML =
        `<div class="jr-sm-error">Not on OSRS hiscores — account may be too new or RSN doesn't match.</div>`;
    }
  }

  function renderStatsModal(name, cId, sk, account){
    const m = statsModalEl;
    if(!m) return;
    // SKILLS and SI are top-level `const` in the host page — accessible
    // as bare globals from any script in the same document. Defensive
    // fallback in case they were renamed someday.
    const SKILLS_LIST = (typeof SKILLS !== 'undefined') ? SKILLS : (window.SKILLS || []);
    const SI_MAP     = (typeof SI     !== 'undefined') ? SI     : (window.SI     || {});

    const atk=sk.attack||{}, str=sk.strength||{}, def=sk.defence||{}, hp=sk.hitpoints||{},
          rng=sk.ranged||{}, pray=sk.prayer||{}, mag=sk.magic||{}, ovr=sk.overall||{};
    const base   = 0.25*((def.level||1)+(hp.level||10)+Math.floor((pray.level||1)/2));
    const melee  = 0.325*((atk.level||1)+(str.level||1));
    const range  = 0.325*(Math.floor((rng.level||1)*1.5));
    const mage   = 0.325*(Math.floor((mag.level||1)*1.5));
    const combat = Math.floor(base + Math.max(melee, range, mage));
    const totalXp = ((ovr.xp||0)/1e6).toFixed(1);

    m.querySelector('#jr-sm-summary').innerHTML = `
      <div class="jr-sm-stat"><div class="jr-sm-stat-v">${ovr.level ?? '—'}</div><div class="jr-sm-stat-k">Total Lvl</div></div>
      <div class="jr-sm-stat"><div class="jr-sm-stat-v">${combat}</div><div class="jr-sm-stat-k">Combat</div></div>
      <div class="jr-sm-stat"><div class="jr-sm-stat-v">${totalXp}M</div><div class="jr-sm-stat-k">Total XP</div></div>
    `;

    // Build the skill cells — same markup the host's fetchHiscores uses
    const grid = m.querySelector('#jr-sm-grid');
    const cellsHtml = SKILLS_LIST.filter(s => s !== 'overall').map(s => {
      const lvl = sk[s]?.level ?? 1;
      if(lvl <= 1) return '';
      const is99 = lvl >= 99;
      return `<div class="skill-cell${is99?' skill-99':''}" data-skill="${s}" data-level="${lvl}" style="cursor:pointer" title="Click to pin">
        <img src="${SI_MAP[s]||''}" onerror="this.style.display='none'"/>
        <div class="sk-lvl">${lvl}</div>
        <div class="sk-name">${s.substring(0,3).toUpperCase()}</div>
      </div>`;
    }).join('');
    grid.innerHTML = cellsHtml || '<div class="jr-sm-empty">No stats above level 1.</div>';
    grid.className = 'jr-sm-grid skills-grid'; // include skills-grid so existing styles apply

    // Apply already-pinned highlights to the modal grid. pinnedSkills is
    // a top-level `let` in the host page — accessible as a bare global
    // from any script in the same document.
    const pinStore = (typeof pinnedSkills !== 'undefined') ? pinnedSkills : (window.pinnedSkills || {});
    const pins = pinStore[cId] || null;
    if(pins && pins.has){
      grid.querySelectorAll('.skill-cell').forEach(c => {
        const skill = c.dataset.skill;
        if(pins.has(skill)) c.classList.add('skill-pinned');
      });
    }

    // Wire click → toggle pin (uses host page's togglePinnedSkill so the
    // sheet sync + notable list rebuild stay consistent with the rest of
    // the app). The host's function expects the cell element it should
    // toggle — passing our modal cell is fine; it just toggles the class.
    // We also mirror the toggle to any existing card-side cell with the
    // same skill so when the card is later expanded, the highlight is
    // already there.
    grid.querySelectorAll('.skill-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const skill = cell.dataset.skill;
        const lvl = parseInt(cell.dataset.level)||0;
        if(typeof window.togglePinnedSkill !== 'function'){
          // Fallback: just toggle visually if the host fn isn't there
          cell.classList.toggle('skill-pinned');
          return;
        }
        // Find any existing card-side cell for this skill and pass IT in
        // so the host's notables rebuild reads from the right grid.
        const cardGrid = document.querySelector(`#${CSS.escape(cId)} .skills-grid`);
        const cardCell = cardGrid ? Array.from(cardGrid.querySelectorAll('.skill-cell')).find(c => {
          const nm = c.querySelector('.sk-name');
          return nm && nm.textContent.toLowerCase() === skill.substring(0,3).toLowerCase();
        }) : null;

        // Toggle on the modal cell (visual feedback in the modal) AND on
        // the card cell (so the existing rebuild logic sees the right state).
        const wasPinned = cell.classList.contains('skill-pinned');
        if(wasPinned){
          cell.classList.remove('skill-pinned');
          if(cardCell) cardCell.classList.remove('skill-pinned');
        } else {
          cell.classList.add('skill-pinned');
          if(cardCell) cardCell.classList.add('skill-pinned');
        }
        // Update the global pin state + sync to sheet, mirroring the host fn
        if(!pinStore[cId]) pinStore[cId] = new Set();
        const pset = pinStore[cId];
        if(wasPinned){
          pset.delete(skill);
          if(typeof window.savePinToSheet === 'function') window.savePinToSheet(cId, skill, 'unpin');
        } else {
          pset.add(skill);
          if(typeof window.savePinToSheet === 'function') window.savePinToSheet(cId, skill, 'pin');
        }
        // Rebuild the notable list on the card (the row of 99/pinned icons
        // shown in the medium body) so the highlight reflects the change.
        const notableEl = document.getElementById('notable-' + cId);
        if(notableEl && cardGrid && typeof window.rebuildNotables === 'function'){
          window.rebuildNotables(cId, notableEl, cardGrid);
        }
      });
    });
  }

  // Expose globally so the inline onclick on the 📊 button can reach it.
  window.JR_OPEN_STATS = openStatsModal;

  /* ───────────────────────────────────────────────────────
     8b. DESCRIPTION EDITOR — opens on the ✏️ icon next to a
     card description. Renders a centered modal with a
     textarea + Save / Cancel. POSTs to the new setDescription
     Apps Script action so the change persists across reloads.
     ─────────────────────────────────────────────────────── */
  let descModalEl = null;

  function ensureDescModal(){
    if(descModalEl) return descModalEl;
    descModalEl = document.createElement('div');
    descModalEl.id = 'jr-desc-modal';
    descModalEl.innerHTML = `
      <div class="jr-dm-card" role="dialog" aria-labelledby="jr-dm-title">
        <div class="jr-dm-head">
          <div>
            <div class="jr-dm-title" id="jr-dm-title">Edit Description</div>
            <div class="jr-dm-sub" id="jr-dm-sub">—</div>
          </div>
          <button class="jr-dm-close" aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        <textarea class="jr-dm-textarea" id="jr-dm-text" rows="5" placeholder="Add a description… (e.g. starter pack notes, build progress, buyer interest)"></textarea>
        <div class="jr-dm-foot">
          <span class="jr-dm-hint">Tip: ⌘/Ctrl + Enter to save</span>
          <div class="jr-dm-actions">
            <button class="jr-dm-cancel" type="button">Cancel</button>
            <button class="jr-dm-save" type="button">💾 Save</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(descModalEl);
    descModalEl.addEventListener('click', e => { if(e.target === descModalEl) closeDescModal(); });
    descModalEl.querySelector('.jr-dm-close').addEventListener('click', closeDescModal);
    descModalEl.querySelector('.jr-dm-cancel').addEventListener('click', closeDescModal);
    return descModalEl;
  }

  function closeDescModal(){
    if(descModalEl) descModalEl.classList.remove('show');
  }

  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && descModalEl && descModalEl.classList.contains('show')){
      e.preventDefault();
      closeDescModal();
    }
  });

  async function openDescEditor(name){
    const m = ensureDescModal();
    const a = findAccount(name);
    if(!a){ alert('Account not found.'); return; }
    m.querySelector('#jr-dm-sub').textContent = name;
    const ta = m.querySelector('#jr-dm-text');
    ta.value = a.desc || '';
    m.classList.add('show');
    setTimeout(() => ta.focus(), 50);

    // Reset the save button so its loading state from a previous save
    // doesn't carry over (was a bug — second-edit attempts saw a still
    // disabled "...saving" button and did nothing).
    let saveBtn = m.querySelector('.jr-dm-save');
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save';

    // Single-use save handler — replace the button to drop any old listener
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    saveBtn = newSave;
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = '… saving';
      try {
        const url = window.getUrl ? window.getUrl() : null;
        if(!url) throw new Error('Sheet URL not configured');
        const res = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({ action: 'setDescription', name, value: ta.value })
        });
        const json = await res.json();
        if(!json.ok) throw new Error(json.error || 'Save failed');

        // Update local data so the next render shows the new desc
        if(JR_DATA){
          const acc = (JR_DATA.accounts||[]).find(x => x.name === name);
          if(acc) acc.desc = ta.value;
        }
        if(window.DATA){
          const acc = (window.DATA.accounts||[]).find(x => x.name === name);
          if(acc) acc.desc = ta.value;
        }

        // Update the visible card directly so the user sees the change
        // immediately without waiting for a full re-render.
        const cards = document.querySelectorAll(`.account-card[data-name="${CSS.escape(name)}"]`);
        cards.forEach(card => {
          let row = card.querySelector('.ac-desc-row');
          if(row){
            const text = row.querySelector('.ac-desc-text');
            const placeholder = row.querySelector('.ac-desc-placeholder');
            if(ta.value){
              if(text){
                text.textContent = ta.value;
              } else if(placeholder){
                placeholder.outerHTML = `<span class="ac-desc-text">${escapeHtml(ta.value)}</span>`;
              }
              row.classList.remove('ac-desc-empty');
            } else {
              if(text){
                text.outerHTML = `<span class="ac-desc-placeholder">No description</span>`;
              }
              row.classList.add('ac-desc-empty');
            }
          }
        });

        // Reset state and close — the next open will start fresh.
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save';
        closeDescModal();
      } catch(err){
        alert('Save failed: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save';
      }
    });

    // Cmd/Ctrl + Enter saves — reference the live button via the modal
    // so this stays correct even if it was just re-cloned.
    ta.onkeydown = e => {
      if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){
        e.preventDefault();
        m.querySelector('.jr-dm-save').click();
      }
    };
  }

  window.JR_EDIT_DESC = openDescEditor;

  /* ───────────────────────────────────────────────────────
     8. SKILL-DRIVEN AUTO-TAGS
     Adds virtual tags to account cards based on their hiscores
     levels. These tags are computed live and rendered into the
     card DOM after fetchHiscores resolves — they are NOT saved
     to the sheet, so removing one would just have it re-appear
     on next hiscores load. Manual tags from the sheet remain
     fully editable.

     Adding a new rule = add an entry to AUTO_TAG_RULES below.
     Each rule: { tag, skill, min, [icon], [iconUrl], [tier] }
       tag      — label shown on the pill (omit for "99-only" tier rules
                  to render just the icon + level)
       skill    — hiscores key (lowercase, e.g. "mining")
       min      — minimum level for the tag to appear
       icon     — optional emoji shown on the pill
       iconUrl  — optional image URL (overrides emoji); used for the
                  per-skill 99 tags so we get the official OSRS icon
       tier     — 'standard' (default) or '99' (gold-glowing tier with
                  no text label, just <icon> 99)
     ─────────────────────────────────────────────────────── */

  // Pull the OSRS skill icon map from the host page. SI is a top-level
  // const declared in <script>, accessible as a bare global.
  const HOST_SI = (typeof SI !== 'undefined') ? SI : (window.SI || {});

  // Auto-generate a "99" tag per skill — one rule per OSRS skill that
  // appears in the icon map. Each fires only when that skill is exactly
  // 99 (or higher, if the cap is ever raised), and renders as an icon
  // + "99" pill in the gold-glowing 99 tier.
  const NINETY_NINE_RULES = Object.keys(HOST_SI)
    .filter(s => s !== 'overall')
    .map(s => ({
      tag: '',                          // no text — icon + "99" only
      skill: s,
      min: 99,
      iconUrl: HOST_SI[s],
      tier: '99'
    }));

  const AUTO_TAG_RULES = [
    // Standard skill-readiness tags (manual rules)
    { tag: 'MLM ready',        skill: 'mining',     min: 31, icon: '⛏️' },
    { tag: 'Tempeross ready',  skill: 'fishing',    min: 35, icon: '🎣' },
    { tag: 'WT ready',         skill: 'firemaking', min: 50, icon: '🔥' },
    // Add more standard rules here, e.g.:
    // { tag: 'Slayer ready',  skill: 'slayer',     min: 50, icon: '💀' },

    // Auto-generated 99-tier rules — one per skill (gold radiance).
    ...NINETY_NINE_RULES,
  ];

  function computeAutoTags(skills){
    if(!skills) return [];
    const out = [];
    for(const r of AUTO_TAG_RULES){
      const lvl = skills[r.skill]?.level || 0;
      if(lvl >= r.min){
        out.push({
          tag: r.tag || '',
          icon: r.icon || '',
          iconUrl: r.iconUrl || '',
          level: lvl,
          skill: r.skill,
          tier: r.tier || 'standard'
        });
      }
    }
    return out;
  }
  window.JR_COMPUTE_AUTO_TAGS = computeAutoTags;

  function applyAutoTagsToCard(name, skills){
    // Find every rendered card for this account (could be on dashboard,
    // workflow view, archive, etc.) and inject the auto-tag pills into
    // the .ac-compact-tags container.
    const escName = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(name) : name;
    const cards = document.querySelectorAll(`.account-card[data-name="${escName}"]`);
    if(!cards.length) return;

    const autoTags = computeAutoTags(skills);
    cards.forEach(card => {
      // Compact view tags container
      let compactTagsContainer = card.querySelector('.ac-compact .ac-compact-tags');
      if(!compactTagsContainer){
        if(autoTags.length){
          compactTagsContainer = document.createElement('div');
          compactTagsContainer.className = 'ac-compact-tags';
          const compactRoot = card.querySelector('.ac-compact .ac-left') || card.querySelector('.ac-compact');
          const compactHeader = compactRoot?.querySelector('.ac-header');
          if(compactHeader && compactHeader.parentNode){
            compactHeader.parentNode.insertBefore(compactTagsContainer, compactHeader.nextSibling);
          } else {
            compactRoot?.appendChild(compactTagsContainer);
          }
        }
      }

      // Expanded view auto-tag slot — sits inside .ac-tags-wrap
      // alongside the manual tag pills, so they share a row.
      const expandedSlot = card.querySelector('.ac-summary .ac-auto-tags-slot');

      // Sort: standard tier first, then 99-tier in RS skills-tab order
      // so the 99 cluster reads as a recognizable trophy row.
      const RS_ORDER_LOCAL = (typeof RS_ORDER_INDEX !== 'undefined') ? RS_ORDER_INDEX : (window.RS_ORDER_INDEX || {});
      autoTags.sort((a, b) => {
        if(a.tier !== b.tier) return a.tier === 'standard' ? -1 : 1;
        if(a.tier === '99'){
          return (RS_ORDER_LOCAL[a.skill] ?? 999) - (RS_ORDER_LOCAL[b.skill] ?? 999);
        }
        return 0;
      });

      // Helper to render the auto-tag pill HTML for a given target style.
      // `mode` controls whether it gets the .ac-tag-pill (matches manual
      // expanded pills) or stays as the compact pill.
      const renderPills = (mode) => autoTags.map(t => {
        const tierCls = t.tier === '99' ? ' jr-auto-tag-99' : '';
        const baseCls = mode === 'expanded' ? 'ac-tag-pill ac-tag-readonly' : 'ac-tag-pill ac-tag-readonly';
        const ruleMin = AUTO_TAG_RULES.find(r => r.skill === t.skill && r.tier === t.tier)?.min;
        const title = `Auto-tagged: ${t.skill} ${t.level}${ruleMin ? ` (≥${ruleMin})` : ''}`;
        const inner = t.tier === '99'
          ? `${t.iconUrl ? `<img class="jr-auto-tag-skill-ic" src="${t.iconUrl}" alt="" onerror="this.style.display='none'"/>` : ''}<span class="jr-auto-tag-99-num">99</span>`
          : `${t.icon ? `<span class="jr-auto-tag-ic">${t.icon}</span>` : ''}${t.tag}`;
        return `<span class="${baseCls} jr-auto-tag${tierCls}" title="${title.replace(/"/g,'&quot;')}">${inner}</span>`;
      }).join('');

      // Apply to compact view
      if(compactTagsContainer){
        compactTagsContainer.querySelectorAll('.jr-auto-tag').forEach(el => el.remove());
        if(autoTags.length){
          compactTagsContainer.insertAdjacentHTML('beforeend', renderPills('compact'));
        }
        // If after adding, the container is empty (no manual + no auto),
        // clean it up so we don't leave an empty wrapper.
        if(!compactTagsContainer.children.length){
          compactTagsContainer.remove();
        }
      }

      // Apply to expanded view's auto-tags slot
      if(expandedSlot){
        expandedSlot.innerHTML = autoTags.length ? renderPills('expanded') : '';
      }
    });
  }

  // Listen for the host's hiscores-loaded event and apply auto-tags.
  // Also re-apply when new card content is rendered (the renderAll hook
  // catches this, but cards are wiped + re-built per render so the
  // hiscores fetch + event happens again anyway).
  document.addEventListener('jr:hiscores-loaded', e => {
    try {
      applyAutoTagsToCard(e.detail.name, e.detail.skills);
    } catch(err){
      console.warn('[auto-tags]', err);
    }
  });

  // Re-apply auto-tags from the cache after each render (in case cards
  // were re-built but hiscores were already cached from a previous fetch).
  function reapplyAllAutoTagsFromCache(){
    const cache = window.JR_SKILLS_CACHE || {};
    Object.entries(cache).forEach(([name, skills]) => {
      try { applyAutoTagsToCard(name, skills); } catch(e){}
    });
    // Also rebuild the auto-tag filter chips so they show every auto-tag
    // currently active across the portfolio.
    rebuildAutoTagFilterChips();
  }

  // Insert filter chips for auto-tags into the existing #tag-chip-row.
  // The chips reuse the host's applyTagFilter() flow — clicking one adds
  // the auto-tag string to portfolioSelectedTags, and the matching logic
  // in applyAllPortfolioFilters (extended above) checks the cache.
  function rebuildAutoTagFilterChips(){
    const tagRow = document.getElementById('tag-chip-row');
    if(!tagRow) return;

    const cache = window.JR_SKILLS_CACHE || {};
    const cachedAccounts = Object.entries(cache);
    if(!cachedAccounts.length) return;

    // Count occurrences of each auto-tag across all cached accounts.
    // Standard auto-tags use the tag label as key; 99-tier uses a
    // synthetic "<skill>-99" key matching the filter logic in HTML.
    const counts = {};                  // key -> count
    const meta = {};                    // key -> { tier, skill, icon, iconUrl, label }
    cachedAccounts.forEach(([name, skills]) => {
      const auto = computeAutoTags(skills);
      auto.forEach(t => {
        const key = t.tier === '99' ? `${t.skill}-99` : t.tag;
        if(!key) return;
        counts[key] = (counts[key] || 0) + 1;
        meta[key] = t;
      });
    });

    // Wipe any existing auto-tag chips so we don't stack duplicates.
    tagRow.querySelectorAll('.tag-chip.jr-auto-tag-chip').forEach(c => c.remove());

    // Sort: standard tier first (alphabetical), then 99 tier in RS order.
    const RS_ORDER_LOCAL = (typeof window.RS_ORDER_INDEX !== 'undefined') ? window.RS_ORDER_INDEX
      : (typeof RS_ORDER_INDEX !== 'undefined' ? RS_ORDER_INDEX : {});
    const keys = Object.keys(counts).sort((a, b) => {
      const ma = meta[a], mb = meta[b];
      if(ma.tier !== mb.tier) return ma.tier === 'standard' ? -1 : 1;
      if(ma.tier === '99'){
        return (RS_ORDER_LOCAL[ma.skill] ?? 999) - (RS_ORDER_LOCAL[mb.skill] ?? 999);
      }
      return (ma.tag||'').localeCompare(mb.tag||'');
    });

    if(!keys.length) return;

    // Build chip HTML and append. Active state mirrors portfolioSelectedTags.
    const selectedSet = (typeof portfolioSelectedTags !== 'undefined') ? portfolioSelectedTags
      : (window.portfolioSelectedTags || new Set());
    const chips = keys.map(key => {
      const m = meta[key];
      const active = selectedSet.has(key) ? ' active-filter' : '';
      const tier99 = m.tier === '99' ? ' jr-auto-tag-chip-99' : '';
      // Escape key for inline JS — same pattern the host uses
      const escKey = String(key).replace(/"/g,'&quot;').replace(/'/g,"\\'");
      const inner = m.tier === '99'
        ? `${m.iconUrl ? `<img class="jr-auto-chip-ic" src="${m.iconUrl}" alt="" onerror="this.style.display='none'"/>` : ''}<span class="jr-auto-chip-99">99</span>`
        : `${m.icon ? `<span class="jr-auto-chip-emoji">${m.icon}</span>` : '🤖'} ${m.tag}`;
      return `<div class="tag-chip jr-auto-tag-chip${tier99}${active}" data-tag="${escKey}" onclick="applyTagFilter('${escKey}',this)" title="Auto-tag">${inner} <span class="chip-count">${counts[key]}</span></div>`;
    }).join('');
    tagRow.insertAdjacentHTML('beforeend', chips);

    // If the row was previously the empty-state placeholder, replace it
    // with the auto chips alone so it doesn't say "no tags" while there
    // are auto-tags showing.
    const placeholder = tagRow.querySelector('div[style*="No tags defined"]');
    if(placeholder && tagRow.querySelectorAll('.tag-chip').length){
      placeholder.remove();
    }
  }
  window.JR_REBUILD_AUTO_TAG_CHIPS = rebuildAutoTagFilterChips;

  // Listen for hiscores load events too so chips update as data arrives
  document.addEventListener('jr:hiscores-loaded', () => {
    setTimeout(rebuildAutoTagFilterChips, 50);
  });

  /* ───────────────────────────────────────────────────────
     9. KPI COUNT-UP ANIMATION
     When dashboard hero numbers change (after data refresh or
     on first load), animate from the previous value up to the
     new one rather than just snapping. Reads as more premium,
     adds a subtle gold flash when the count completes.

     Uses the Intl-aware parser so values like "$1,234.56" or
     "12.5%" round-trip correctly. Skips elements where the
     content isn't number-like (e.g. "—" placeholders).
     ─────────────────────────────────────────────────────── */
  const KPI_PREV = {};                  // id → last numeric value
  const KPI_DURATION = 850;             // ms — slightly under 1s feels alive but not slow

  // Parse a display string like "$1,234.56" / "12.5%" / "—" into
  // { num, prefix, suffix, decimals }. Returns null if not numeric.
  function parseKpiText(text){
    if(text == null) return null;
    const s = String(text).trim();
    if(!s || s === '—' || s === '-' || s === '?') return null;
    const m = s.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)([^\d]*)$/);
    if(!m) return null;
    const numStr = m[2].replace(/,/g, '');
    const num = parseFloat(numStr);
    if(!isFinite(num)) return null;
    const decimals = (numStr.split('.')[1] || '').length;
    return { num, prefix: m[1] || '', suffix: m[3] || '', decimals };
  }

  function formatKpiNum(num, prefix, suffix, decimals){
    const fixed = num.toFixed(decimals);
    // Add thousands separators
    const [intPart, decPart] = fixed.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = decPart != null ? `${withCommas}.${decPart}` : withCommas;
    return prefix + formatted + suffix;
  }

  function animateKpi(el, from, to, parsed){
    const start = performance.now();
    const delta = to - from;
    if(Math.abs(delta) < 0.0001){
      // No real change — just set the formatted version and exit
      el.textContent = formatKpiNum(to, parsed.prefix, parsed.suffix, parsed.decimals);
      return;
    }
    function step(now){
      const t = Math.min(1, (now - start) / KPI_DURATION);
      // ease-out cubic — fast start, gentle landing
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + delta * eased;
      el.textContent = formatKpiNum(v, parsed.prefix, parsed.suffix, parsed.decimals);
      if(t < 1){
        requestAnimationFrame(step);
      } else {
        // Brief gold flash on completion (handled by CSS class)
        el.classList.add('jr-kpi-just-updated');
        setTimeout(() => el.classList.remove('jr-kpi-just-updated'), 900);
      }
    }
    requestAnimationFrame(step);
  }

  // Sweep all .stat-value elements and animate any that changed.
  // Run after onDataRendered so values are at their final state.
  function runKpiCountUp(){
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      return; // user prefers no motion — skip the animation entirely
    }
    document.querySelectorAll('.stat-value').forEach(el => {
      const id = el.id;
      if(!id) return; // skip un-IDed values; can't track previous
      const parsed = parseKpiText(el.textContent);
      if(!parsed) return;
      const prev = KPI_PREV[id];
      KPI_PREV[id] = parsed.num;
      // First time we see this KPI, animate from 0 (so initial load
      // gets the satisfying "tick up to value" effect). On subsequent
      // refreshes, animate from previous to new.
      const from = (prev == null) ? 0 : prev;
      if(from === parsed.num) return;   // no change → skip
      animateKpi(el, from, parsed.num, parsed);
    });
  }

  /* ───────────────────────────────────────────────────────
     POST-RENDER ORCHESTRATOR
     ─────────────────────────────────────────────────────── */
  function onDataRendered(data){
    if(!data) return;
    JR_DATA = data;
    // Also expose to window so other scripts (brand.js etc.) can use it
    if(!window.DATA) window.DATA = data;
    renderDigest(data);
    renderSparklines(data);
    renderGoalRing(data);
    // Re-apply skill-driven auto-tags to any newly rendered cards using
    // the cached hiscores data (real-time auto-tags will follow when
    // fetchHiscores resolves and dispatches its event).
    setTimeout(reapplyAllAutoTagsFromCache, 50);
    // Animate any KPI values that changed since last render
    setTimeout(runKpiCountUp, 80);
  }
})();
