/* ============================================================
   4JIRAIYA · PREMIUM LAYER (theme + decorations)
   Loads AFTER 4jiraiya-brand.js. Pure additive.
   ============================================================ */
(function(){
  'use strict';

  /* ── 1. THEME ENGINE ───────────────────────────────────── */
  const STORAGE_KEY = 'jr_theme';
  function getTheme(){
    try { return localStorage.getItem(STORAGE_KEY) || 'dark'; }
    catch(e){ return 'dark'; }
  }
  function setTheme(t){
    document.documentElement.setAttribute('data-jr-theme', t);
    document.body.setAttribute('data-jr-theme', t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch(e){}
    const tog = document.querySelector('.jr-theme-toggle');
    if(tog) tog.setAttribute('data-mode', t);
    // Notify any chart libs that may want to repaint
    window.dispatchEvent(new CustomEvent('jr-theme-changed', {detail:{theme:t}}));
  }
  function toggleTheme(){
    const t = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(t);
    // little visual ping
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed;inset:0;background:${t==='light'?'rgba(255,248,230,0)':'rgba(10,8,5,0)'};
      pointer-events:none;z-index:99999;transition:background .25s ease;`;
    document.body.appendChild(flash);
    requestAnimationFrame(()=>{
      flash.style.background = t==='light' ? 'rgba(255,248,230,.45)' : 'rgba(10,8,5,.5)';
      setTimeout(()=>{
        flash.style.background = 'transparent';
        setTimeout(()=>flash.remove(), 280);
      }, 80);
    });
  }
  // Apply asap so the page never flashes wrong colors
  setTheme(getTheme());

  /* ── 2. THEME TOGGLE in TOPBAR ─────────────────────────── */
  function buildToggle(){
    if(document.querySelector('.jr-theme-toggle')) return;
    const refreshBtn = document.querySelector('.btn-refresh');
    if(!refreshBtn) return;

    const tog = document.createElement('button');
    tog.className = 'jr-theme-toggle';
    tog.type = 'button';
    tog.title = 'Toggle theme (⌘⇧L / Ctrl+Shift+L)';
    tog.setAttribute('data-mode', getTheme());
    tog.innerHTML = `
      <span class="jr-theme-seg light" aria-label="Light">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <circle cx="12" cy="12" r="4.5"/>
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>
        </svg>
      </span>
      <span class="jr-theme-seg dark" aria-label="Dark">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a7 7 0 0 0 10 10z"/>
        </svg>
      </span>`;
    tog.addEventListener('click', toggleTheme);
    refreshBtn.parentNode.insertBefore(tog, refreshBtn);
  }

  /* ── 3. THEME HOTKEY (⌘⇧L) ─────────────────────────────── */
  window.addEventListener('keydown', e => {
    const k = (e.key||'').toLowerCase();
    if((e.metaKey||e.ctrlKey) && e.shiftKey && k === 'l'){
      e.preventDefault();
      toggleTheme();
    }
  }, true);

  /* ── 4. INJECT EMPTY-STATE / DECORATIVE SVG TEMPLATES ─── */
  // Halo + broken helmet illustration (used in empty states)
  const helmetSVG = `
    <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="jr-gold-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff0b8"/>
          <stop offset=".4" stop-color="#f0b93a"/>
          <stop offset="1" stop-color="#6b4d12"/>
        </linearGradient>
        <linearGradient id="jr-helmet-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#a3382b"/>
          <stop offset="1" stop-color="#5b1a12"/>
        </linearGradient>
        <radialGradient id="jr-halo-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stop-color="#f0b93a" stop-opacity=".7"/>
          <stop offset="1" stop-color="#f0b93a" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <!-- halo glow -->
      <ellipse cx="100" cy="40" rx="60" ry="14" fill="url(#jr-halo-glow)"/>
      <!-- halo ring -->
      <ellipse cx="100" cy="40" rx="38" ry="7" fill="none" stroke="url(#jr-gold-grad)" stroke-width="2"/>
      <ellipse cx="100" cy="40" rx="26" ry="3.5" fill="none" stroke="#fff0b8" stroke-width="1" opacity=".7"/>
      <!-- broken helmet -->
      <g transform="translate(100,110)">
        <!-- main helmet body (cracked) -->
        <path d="M-32 -10 L-28 -28 L-12 -34 L8 -34 L26 -26 L32 -10 L28 8 L-28 8 Z"
              fill="url(#jr-helmet-grad)" stroke="#3a0e08" stroke-width="1"/>
        <!-- visor slit -->
        <path d="M-20 -12 L-4 -16 L4 -16 L20 -12 L16 -8 L-16 -8 Z" fill="#1a0807"/>
        <!-- crack -->
        <path d="M-10 -32 L-6 -18 L-12 -10 L-4 4" fill="none" stroke="#f0b93a" stroke-width="1.2" opacity=".55"/>
        <!-- spike on top -->
        <path d="M-2 -34 L0 -50 L4 -34 Z" fill="url(#jr-helmet-grad)" stroke="#3a0e08" stroke-width=".8"/>
        <!-- shards on ground -->
        <path d="M-44 10 L-36 6 L-32 12 Z" fill="#7a1f15"/>
        <path d="M36 12 L42 8 L46 14 L40 16 Z" fill="#7a1f15"/>
        <path d="M-50 14 L-46 12 L-44 16 Z" fill="#5b1a12"/>
        <path d="M48 16 L52 14 L52 18 Z" fill="#5b1a12"/>
      </g>
      <!-- embers -->
      <circle cx="60" cy="80" r="1.2" fill="#f0b93a" opacity=".7"/>
      <circle cx="140" cy="70" r="1" fill="#f0b93a" opacity=".5"/>
      <circle cx="80" cy="60" r=".8" fill="#fff0b8" opacity=".8"/>
      <circle cx="135" cy="95" r="1.1" fill="#f0b93a" opacity=".6"/>
      <circle cx="55" cy="100" r=".7" fill="#fff0b8" opacity=".6"/>
    </svg>`;

  // Make available globally so empty-state code anywhere can use it
  window.JR_EMPTY = function(title, sub){
    return `<div class="jr-empty-illo">${helmetSVG}
      <div class="jr-empty-title">${title||'No data yet'}</div>
      <div class="jr-empty-sub">${sub||''}</div></div>`;
  };

  /* ── 5. UPGRADE BUILT-IN EMPTY STATES ──────────────────── */
  // Watch for "No accounts", "No goals" type messages and replace with branded illo.
  const emptyPhrases = [
    {match: /no accounts/i,    title:'No legends in the inventory',  sub:'Add your first account to begin building the legacy.'},
    {match: /no goals|no active goals/i, title:'No goals set',        sub:'Stake your claim — every goal is a step toward the legacy.'},
    {match: /no expenses/i,    title:'No expenses logged',           sub:'A clean ledger. Every coin still in your war chest.'},
    {match: /no archived/i,    title:'The vault is empty',           sub:'Archived accounts will rest here.'},
    {match: /no commission/i,  title:'No commissions yet',           sub:'Once cards are paid out, the tally appears here.'},
    {match: /no data|no records/i, title:'Nothing here yet',         sub:'Pull data or add your first entry to bring this section to life.'}
  ];

  function decorateEmptyStates(){
    document.querySelectorAll('.empty-state, .empty, [data-empty="true"]').forEach(el => {
      if(el.dataset.jrDecorated) return;
      const txt = (el.textContent||'').trim();
      const match = emptyPhrases.find(p => p.match.test(txt));
      if(match){
        el.dataset.jrDecorated = '1';
        el.innerHTML = window.JR_EMPTY(match.title, match.sub);
      }
    });
  }

  /* ── 6. ORNATE DIVIDER UTILITY ─────────────────────────── */
  // Insert ornate dividers between sibling .panel groups to add rhythm.
  // Triggered on first dashboard render only.
  function insertDividers(){
    const dash = document.querySelector('#page-dashboard');
    if(!dash || dash.dataset.jrDividers) return;
    // find big section breaks: hero row → goals → cashflow etc.
    const sections = dash.querySelectorAll('[data-section-divider]');
    sections.forEach(s => {
      if(s.previousElementSibling?.classList?.contains('jr-divider')) return;
      const d = document.createElement('div');
      d.className = 'jr-divider';
      d.textContent = s.dataset.sectionDivider || '◆';
      s.parentNode.insertBefore(d, s);
    });
    dash.dataset.jrDividers = '1';
  }

  /* ── 7. APPLY .jr-display TO HERO MONEY VALUES ─────────── */
  function applyDisplayClass(){
    // Auto-tag prominent currency stats so they get the Cormorant display treatment
    document.querySelectorAll('.stat-value').forEach(el => {
      if(el.dataset.jrDisplayed) return;
      el.dataset.jrDisplayed = '1';
      // already styled in CSS as Cormorant — no action needed, but mark for future use
    });
  }

  /* ── 8. ADD THEME COMMANDS to the existing palette ─────── */
  function addPaletteCommands(){
    // brand.js exposes COMMANDS via closure. Easiest is to inject a fresh palette item
    // by listening for the search input and post-filtering. We'll instead add a global
    // event the brand.js could read; for now we wire keys directly.
    // Also: clicking the theme toggle is enough; palette command is bonus.
  }

  /* ── 9. INIT ───────────────────────────────────────────── */
  function init(){
    buildToggle();
    decorateEmptyStates();
    insertDividers();
    applyDisplayClass();

    // Inject vignette layer
    if(!document.querySelector('.jr-vignette')){
      const v = document.createElement('div');
      v.className = 'jr-vignette';
      document.body.appendChild(v);
    }
  }

  // Run after brand.js has built its bits
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
  } else {
    setTimeout(init, 100);
  }

  // Re-decorate when tabs change (cheap polling on click)
  document.addEventListener('click', e => {
    if(e.target.closest('.nav-tab, .btn-refresh')){
      setTimeout(decorateEmptyStates, 250);
      setTimeout(decorateEmptyStates, 800);
    }
  });

  // Expose globals for the existing palette to call
  window.JR_TOGGLE_THEME = toggleTheme;
  window.JR_GET_THEME = getTheme;
  window.JR_SET_THEME = setTheme;
})();
