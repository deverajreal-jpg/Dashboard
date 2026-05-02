/* ============================================================
   4JIRAIYA BRAND ENHANCEMENT — runtime (lightweight)
   ============================================================ */
(function(){
  'use strict';

  // ── 1. SPLASH (only first time per session) ──────────────
  function buildSplash(){
    if(sessionStorage.getItem('jr_splash_seen')) return;
    sessionStorage.setItem('jr_splash_seen','1');
    const s = document.createElement('div');
    s.id = 'jr-splash';
    s.innerHTML = `
      <div class="jr-splash-stage">
        <div class="jr-splash-ring r3"></div>
        <div class="jr-splash-ring r2"></div>
        <div class="jr-splash-ring"></div>
        <div class="jr-splash-pfp"></div>
      </div>
      <div class="jr-splash-tagline">ONE LIFE &nbsp; × &nbsp; ONE LEGACY</div>
      <div class="jr-splash-version">4JIRAIYA · COMMAND DECK</div>
    `;
    document.body.appendChild(s);
    setTimeout(()=>{ s.remove(); }, 3400);
  }

  // ── 2. INJECT BRAND LOGO INTO TOPBAR ─────────────────────
  function injectBrand(){
    const topbar = document.querySelector('.topbar');
    if(!topbar) return;
    const oldLogo = topbar.querySelector('.logo');
    const brand = document.createElement('div');
    brand.className = 'jr-brand';
    brand.title = 'Open command palette (⌘K / Ctrl+K)';
    brand.innerHTML = `
      <div class="jr-brand-avatar"></div>
      <div class="jr-brand-text">
        <div class="jr-brand-name">4JIRAIYA</div>
        <div class="jr-brand-tag">ONE LIFE <span class="jr-x">×</span> ONE LEGACY</div>
      </div>
      <div class="jr-status-dot" title="Live"></div>
    `;
    brand.addEventListener('click', openPalette);
    if(oldLogo) oldLogo.parentNode.insertBefore(brand, oldLogo);
    else topbar.prepend(brand);
  }

  // ── 3. EMBER PARTICLES — lightweight, throttled ──────────
  // Skip on mobile / reduced motion. No per-frame radial gradients.
  function startEmbers(){
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced || window.innerWidth < 700) return;

    const c = document.createElement('canvas');
    c.id = 'jr-embers';
    document.body.appendChild(c);
    const ctx = c.getContext('2d', { alpha: true });
    let w, h;

    function size(){
      // No DPR scaling — half-resolution canvas stretched looks fine for soft particles
      w = c.width = Math.floor(window.innerWidth * 0.6);
      h = c.height = Math.floor(window.innerHeight * 0.6);
      c.style.width = window.innerWidth+'px';
      c.style.height = window.innerHeight+'px';
    }
    size();
    window.addEventListener('resize', size, { passive: true });

    // Far fewer particles, simple solid circles (no gradient per particle)
    const N = 18;
    const embers = [];
    for(let i=0;i<N;i++){
      embers.push({
        x: Math.random()*w,
        y: Math.random()*h,
        r: 0.5 + Math.random()*1.4,
        vy: -(0.12 + Math.random()*0.30),
        vx: (Math.random()-0.5)*0.12,
        a: 0.25 + Math.random()*0.45,
        twk: Math.random()*Math.PI*2
      });
    }

    let running = true;
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if(running) loop();
    });

    let last = 0;
    const FRAME_MS = 1000/30; // cap at 30fps
    function loop(t){
      if(!running) return;
      if(t - last < FRAME_MS){ requestAnimationFrame(loop); return; }
      last = t;
      ctx.clearRect(0,0,w,h);
      ctx.globalCompositeOperation = 'lighter';
      for(const p of embers){
        p.x += p.vx;
        p.y += p.vy;
        p.twk += 0.05;
        const flick = 0.65 + 0.35*Math.sin(p.twk);
        if(p.y < -4) { p.y = h + 4; p.x = Math.random()*w; }
        if(p.x < -4) p.x = w+4;
        if(p.x > w+4) p.x = -4;

        // Outer glow: one cheap fillStyle, no gradient
        ctx.fillStyle = `rgba(240,185,58,${p.a * flick * 0.18})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI*2);
        ctx.fill();
        // Hot core
        ctx.fillStyle = `rgba(255,220,140,${p.a * flick})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // ── 4. CLICK RIPPLES (cheap; passive listener) ───────────
  function attachRipples(){
    document.addEventListener('click', e => {
      const t = e.target.closest('button, .nav-tab, .jr-brand, #jr-companion, .jr-palette-item');
      if(!t) return;
      const r = document.createElement('span');
      r.className = 'jr-ripple';
      r.style.position = 'fixed';
      r.style.left = e.clientX+'px';
      r.style.top  = e.clientY+'px';
      r.style.width = r.style.height = '40px';
      document.body.appendChild(r);
      setTimeout(()=>r.remove(), 700);
    });
  }

  // ── 5. COMPANION (no per-frame loop, CSS only) ───────────
  const TIPS = [
    {tip:'Quick tip', msg:'Press ⌘K / Ctrl+K to summon the command palette.'},
    {tip:'Hotkeys', msg:'D = Dashboard · P = Portfolio · C = Cash Flow · R = Refresh.'},
    {tip:'Welcome back', msg:'Hover any panel to see it light up.'},
    {tip:'Reminder', msg:'Banned ≠ failure — every L is logged. The legacy continues.'},
    {tip:'One Life', msg:'Track every flip. Build the legacy.'},
    {tip:'Pro move', msg:'Press / to focus the account search instantly.'},
  ];
  function buildCompanion(){
    const c = document.createElement('div');
    c.id = 'jr-companion';
    c.title = 'Click for tips · Double-click for command palette';
    document.body.appendChild(c);

    const b = document.createElement('div');
    b.id = 'jr-bubble';
    document.body.appendChild(b);

    let bubbleTimer;
    function showBubble(item, dur){
      b.innerHTML = `<div class="jr-bubble-tip">${item.tip}</div><div>${item.msg}</div>`;
      b.classList.add('show');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(()=>b.classList.remove('show'), dur||4500);
    }

    let idx = 0;
    c.addEventListener('click', () => {
      const item = TIPS[idx % TIPS.length];
      idx++;
      showBubble(item);
    });
    c.addEventListener('dblclick', openPalette);

    setTimeout(()=>{
      showBubble({tip:'4Jiraiya', msg:'Click me anytime for tips · Double-click to open the command palette.'}, 5500);
    }, sessionStorage.getItem('jr_splash_seen') ? 800 : 3500);
  }

  // ── 6. COMMAND PALETTE ───────────────────────────────────
  const COMMANDS = [
    {label:'Refresh data', icon:'⟳', hint:'Pull latest from the sheet', kbd:'R', run:()=>{ const b=document.querySelector('.btn-refresh'); if(b) b.click(); }},
    {label:'Add Account', icon:'⚔️', hint:'New account in Inventory', run:()=>tryClick('button[onclick*="\'account\'"]')},
    {label:'Add Account Expense', icon:'💸', hint:'Log a per-account expense', run:()=>tryClick('button[onclick*="\'expense\'"]')},
    {label:'Add Cash Flow movement', icon:'💱', hint:'Capital in/out, transfer, etc.', run:()=>tryClick('button[onclick*="cashFlowAdd"]')},
    {label:'Add Goal', icon:'🎯', hint:'Set a Net Profit target', run:()=>tryClick('button[onclick*="\'goals\'"]')},
    {label:'Go to Dashboard', icon:'📊', hint:'Overview & metrics', kbd:'D', run:()=>goPage('dashboard')},
    {label:'Go to Portfolio', icon:'🗂️', hint:'All your accounts', kbd:'P', run:()=>goPage('portfolio')},
    {label:'Go to Account Expenses', icon:'💸', hint:'Spend by account', kbd:'E', run:()=>goPage('expenses')},
    {label:'Go to Cash Flow', icon:'💱', hint:'Capital movements & transfers', kbd:'C', run:()=>goPage('cashflow')},
    {label:'Go to Archive', icon:'🗄', hint:'Banned & retired accounts', kbd:'A', run:()=>goPage('archive')},
    {label:'Go to Setup', icon:'⚙', hint:'API URL, sheet config', kbd:'S', run:()=>goPage('setup')},
    {label:'Find an account', icon:'🔎', hint:'Focus the header search', kbd:'/', run:()=>{ const i=document.getElementById('header-find-input'); if(i){ i.focus(); i.select(); }}},
    {label:'Toggle theme', icon:'☯', hint:'Switch between dark and parchment', kbd:'⌘⇧L', run:()=>{ if(window.JR_TOGGLE_THEME) window.JR_TOGGLE_THEME(); }},
    {label:'Print Weekly Brief', icon:'📜', hint:'Open the parchment report ready to print or save as PDF', run:()=>{ if(window.JR_PRINT_REPORT) window.JR_PRINT_REPORT(); }},
    {label:'Replay welcome', icon:'✨', hint:'Show the onboarding tour again', run:()=>{ if(window.JR_REPLAY_ONBOARDING) window.JR_REPLAY_ONBOARDING(); }},
  ];

  function tryClick(sel){ const b = document.querySelector(sel); if(b) b.click(); }
  function goPage(name){
    const tab = document.querySelector(`.nav-tab[onclick*="'${name}'"]`);
    if(tab) tab.click();
  }

  let paletteEl, paletteSearch, paletteList, paletteActive = 0, paletteFiltered = COMMANDS.slice();

  function buildPalette(){
    paletteEl = document.createElement('div');
    paletteEl.id = 'jr-palette';
    paletteEl.innerHTML = `
      <div class="jr-palette-card">
        <div class="jr-palette-header">
          <div class="jr-palette-avatar"></div>
          <div class="jr-palette-greeting">
            <div class="jr-palette-hi">Command, Jiraiya.</div>
            <div class="jr-palette-sub">Search or pick an action below.</div>
          </div>
          <span class="jr-palette-kbd">ESC</span>
        </div>
        <input class="jr-palette-search" id="jr-palette-search" placeholder="Type to filter — accounts, pages, actions…" autocomplete="off"/>
        <div class="jr-palette-list" id="jr-palette-list"></div>
        <div class="jr-palette-foot">
          <span>↑ ↓ NAVIGATE · ⏎ RUN · ESC CLOSE</span>
          <span class="jr-foot-tag">ONE LIFE × ONE LEGACY</span>
        </div>
      </div>
    `;
    document.body.appendChild(paletteEl);
    paletteSearch = paletteEl.querySelector('#jr-palette-search');
    paletteList = paletteEl.querySelector('#jr-palette-list');

    paletteEl.addEventListener('click', e => { if(e.target === paletteEl) closePalette(); });
    paletteSearch.addEventListener('input', () => filterPalette(paletteSearch.value));

    window.addEventListener('keydown', e => {
      if(!paletteEl || !paletteEl.classList.contains('show')) return;
      const k = e.key;
      if(k === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); closePalette(); }
      else if(k === 'ArrowDown'){ e.preventDefault(); e.stopImmediatePropagation(); paletteActive = Math.min(paletteFiltered.length-1, paletteActive+1); renderPalette(); scrollActiveIntoView(); }
      else if(k === 'ArrowUp'){ e.preventDefault(); e.stopImmediatePropagation(); paletteActive = Math.max(0, paletteActive-1); renderPalette(); scrollActiveIntoView(); }
      else if(k === 'Enter'){
        e.preventDefault(); e.stopImmediatePropagation();
        const c = paletteFiltered[paletteActive];
        if(c && c.run){ closePalette(); setTimeout(()=>c.run(), 50); }
      }
    }, true);
  }

  function scrollActiveIntoView(){
    if(!paletteList) return;
    const el = paletteList.querySelector('.jr-palette-item.active');
    if(el){
      const r = el.getBoundingClientRect();
      const pr = paletteList.getBoundingClientRect();
      if(r.top < pr.top) paletteList.scrollTop -= (pr.top - r.top) + 4;
      else if(r.bottom > pr.bottom) paletteList.scrollTop += (r.bottom - pr.bottom) + 4;
    }
  }

  function gatherAccountCommands(){
    const out = [];
    try{
      const d = window.DATA;
      if(d && Array.isArray(d.accounts)){
        d.accounts.slice(0, 50).forEach(a => {
          if(!a || !a.name) return;
          out.push({
            label: a.name,
            icon: '👤',
            hint: `${a.type||'Account'}${a.status?(' · '+a.status):''}`,
            run: () => {
              const inp = document.getElementById('header-find-input');
              if(inp){ inp.value = a.name; if(typeof window.onHeaderFind === 'function') window.onHeaderFind(a.name); }
            }
          });
        });
      }
    } catch(e){}
    return out;
  }

  function renderPalette(){
    paletteList.innerHTML = paletteFiltered.map((c, i) => `
      <div class="jr-palette-item ${i===paletteActive?'active':''}" data-i="${i}">
        <div class="jr-palette-icon">${c.icon||'•'}</div>
        <div class="jr-palette-meta">
          <div class="jr-palette-label">${c.label}</div>
          ${c.hint?`<div class="jr-palette-hint">${c.hint}</div>`:''}
        </div>
        ${c.kbd?`<span class="jr-palette-kbd">${c.kbd}</span>`:''}
      </div>
    `).join('') || `<div style="padding:30px;text-align:center;color:var(--text-dim);font-size:13px">No matches.</div>`;
    paletteList.querySelectorAll('.jr-palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const c = paletteFiltered[parseInt(el.dataset.i)];
        if(c && c.run){ closePalette(); setTimeout(()=>c.run(), 50); }
      });
    });
  }

  function filterPalette(q){
    const all = COMMANDS.concat(gatherAccountCommands());
    const lq = q.trim().toLowerCase();
    paletteFiltered = !lq ? all : all.filter(c =>
      c.label.toLowerCase().includes(lq) || (c.hint||'').toLowerCase().includes(lq)
    );
    paletteActive = 0;
    renderPalette();
  }

  function openPalette(){
    if(!paletteEl) buildPalette();
    paletteEl.classList.add('show');
    paletteSearch.value = '';
    filterPalette('');
    setTimeout(()=>paletteSearch.focus(), 50);
  }
  function closePalette(){
    if(paletteEl) paletteEl.classList.remove('show');
  }
  window.jrOpenPalette = openPalette;

  // ── 7. HOTKEYS ───────────────────────────────────────────
  function attachHotkeys(){
    document.addEventListener('keydown', e => {
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){
        e.preventDefault(); openPalette(); return;
      }
      const t = document.activeElement;
      const inField = t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.tagName==='SELECT' || t.isContentEditable);
      if(inField) return;
      if(e.key === '/'){ e.preventDefault(); const i=document.getElementById('header-find-input'); if(i) i.focus(); }
      else if(e.key.toLowerCase()==='d') goPage('dashboard');
      else if(e.key.toLowerCase()==='p') goPage('portfolio');
      else if(e.key.toLowerCase()==='e') goPage('expenses');
      else if(e.key.toLowerCase()==='c') goPage('cashflow');
      else if(e.key.toLowerCase()==='a') goPage('archive');
      else if(e.key.toLowerCase()==='s') goPage('setup');
      else if(e.key.toLowerCase()==='r'){ const b=document.querySelector('.btn-refresh'); if(b) b.click(); }
    });
  }

  // ── INIT ──────────────────────────────────────────────────
  function init(){
    buildSplash();
    injectBrand();
    startEmbers();
    attachRipples();
    buildCompanion();
    attachHotkeys();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
