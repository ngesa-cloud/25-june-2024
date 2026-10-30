/**
 * Global Search Engine for 25.06.2024 Accountability Platform
 * Cross-references Politician JSON Dossiers, Evidence Locker, and Network Connection Graph
 * Produces structured intelligence queries: "Politician X is connected to Company Y regarding Scandal Z"
 */

(function () {
  'use strict';

  let searchIndex = [];
  let isLoaded = false;
  let activeDropdown = null;

  // Determine base API path relative to current URL
  function getApiBase() {
    const isPublic = window.location.pathname.includes('/public/');
    return isPublic ? 'api/' : 'public/api/';
  }

  // Parse monetary amounts to raw numeric integer for ranking and matching
  function parseAmountToNumber(amountStr) {
    if (!amountStr || typeof amountStr !== 'string') return 0;
    const clean = amountStr.toLowerCase().replace(/,/g, '').trim();
    const numMatch = clean.match(/([\d.]+)/);
    if (!numMatch) return 0;
    const val = parseFloat(numMatch[1]);
    if (clean.includes('billion') || clean.includes('b')) {
      return Math.round(val * 1000000000);
    }
    if (clean.includes('million') || clean.includes('m')) {
      return Math.round(val * 1000000);
    }
    return Math.round(val);
  }

  // Load and index data from Politicians and Network Graph
  async function initSearchIndex() {
    if (isLoaded) return searchIndex;
    const base = getApiBase();

    try {
      // 1. Fetch index of politicians
      let indexRes = await fetch(`${base}politicians/index.json`).catch(() => null);
      if (!indexRes || !indexRes.ok) {
        indexRes = await fetch('api/politicians/index.json').catch(() => null);
      }
      const slugs = indexRes && indexRes.ok ? await indexRes.json() : [
        'william-ruto', 'johnson-sakaja', 'edwin-sifuna', 'robert-alai', 'rigathi-gachagua', 'raila-odinga', 'kalonzo-musyoka'
      ];

      // 2. Fetch all politician dossiers in parallel
      const politicianPromises = slugs.map(slug =>
        fetch(`${base}politicians/${slug}.json`)
          .then(r => r.ok ? r.json() : fetch(`api/politicians/${slug}.json`).then(r2 => r2.json()))
          .catch(() => null)
      );

      // 3. Fetch network graph
      const networkPromise = fetch(`${base}network.json`)
        .then(r => r.ok ? r.json() : fetch('api/network.json').then(r2 => r2.json()))
        .catch(() => ({ nodes: [], edges: [] }));

      // 4. Fetch OSINT leaks index
      const leaksPromise = fetch(`${base}leaks/index.json`)
        .then(r => r.ok ? r.json() : fetch('api/leaks/index.json').then(r2 => r2.json()))
        .catch(() => []);

      // 5. Fetch Nairobi properties index
      const propertiesPromise = fetch(`${base}properties.json`)
        .then(r => r.ok ? r.json() : fetch('api/properties.json').then(r2 => r2.json()))
        .catch(() => []);

      // 6. Fetch NSE Insider Equities index
      const nsePromise = fetch(`${base}nse_insider.json`)
        .then(r => r.ok ? r.json() : fetch('api/nse_insider.json').then(r2 => r2.json()))
        .catch(() => []);

      // 7. Fetch Kenya Market Watch (suspicious trade patterns)
      const marketWatchPromise = fetch(`${base}market-watch.json`)
        .then(r => r.ok ? r.json() : fetch('api/market-watch.json').then(r2 => r2.json()))
        .catch(() => []);

      const [politicians, networkData, leaksData, propertiesData, nseData, marketWatchData] = await Promise.all([
        Promise.all(politicianPromises),
        networkPromise,
        leaksPromise,
        propertiesPromise,
        nsePromise,
        marketWatchPromise
      ]);

      const validPoliticians = politicians.filter(Boolean);
      const networkNodes = (networkData && networkData.nodes) || [];
      const networkEdges = (networkData && networkData.edges) || [];

      const nodeMap = {};
      networkNodes.forEach(n => { nodeMap[n.id] = n; });

      const indexRecords = [];

      // Build records from politician dossiers
      validPoliticians.forEach(pol => {
        const polName = pol.name || pol.id;
        const polId = pol.id;
        const party = pol.party || '';
        const position = pol.position || '';
        const county = pol.county || '';
        const govLevel = pol.governance_level || '';
        const topEvidence = Array.isArray(pol.evidence) ? pol.evidence : [];

        // Index scandals & financial connections
        if (Array.isArray(pol.scandals)) {
          pol.scandals.forEach(scandal => {
            const scandalName = scandal.name || 'Unspecified Project';
            const entity = scandal.entity || 'State Agency / Private Entity';
            const amount = scandal.amount || 'Undisclosed';
            const rawAmount = scandal.raw_amount || parseAmountToNumber(amount);
            const status = scandal.status || 'Active Inquiry';
            const year = scandal.year || 2024;
            const summary = scandal.summary || '';
            const evList = Array.isArray(scandal.evidence) ? scandal.evidence : [];

            // The relationship sentence
            const connectionSentence = `${polName} is connected to ${entity} regarding ${scandalName} (${amount}).`;

            const evTitles = evList.map(e => `${e.type} ${e.title}`).join(' ');

            indexRecords.push({
              type: 'financial_scandal',
              politicianName: polName,
              politicianId: polId,
              county: county,
              govLevel: govLevel,
              entityName: entity,
              scandalName: scandalName,
              amount: amount,
              rawAmount: rawAmount,
              status: status,
              year: year,
              summary: summary,
              sentence: connectionSentence,
              evidenceCount: evList.length,
              evidenceList: evList,
              tokens: [
                polName, polId, entity, scandalName, amount, status, String(year), summary, party, position, county, govLevel,
                evTitles,
                amount.replace(/\s+/g, ''), // e.g. "30B", "21B", "10.6B"
                ...(entity.split(/[\s/()]+/).filter(w => w.length > 2))
              ].map(t => String(t).toLowerCase())
            });
          });
        }

        // Index promises
        if (Array.isArray(pol.promises)) {
          pol.promises.forEach(prom => {
            const promiseText = prom.promise || '';
            const status = prom.status || 'Tracked';
            const year = prom.year || 2022;
            const summaryText = prom.evidence_summary || (typeof prom.evidence === 'string' ? prom.evidence : '');
            const evList = Array.isArray(prom.evidence) ? prom.evidence : [];
            const evTitles = evList.map(e => `${e.type} ${e.title}`).join(' ');

            indexRecords.push({
              type: 'promise',
              politicianName: polName,
              politicianId: polId,
              county: county,
              govLevel: govLevel,
              entityName: county ? `${county} County` : 'Electorate of Kenya',
              scandalName: promiseText,
              amount: 'Manifesto Commitment',
              rawAmount: 0,
              status: status,
              year: year,
              summary: summaryText,
              sentence: `${polName} pledged: "${promiseText}" (${status}).`,
              evidenceCount: evList.length,
              evidenceList: evList,
              tokens: [
                polName, polId, promiseText, status, String(year), summaryText, party, county, govLevel, 'promise', 'manifesto', evTitles
              ].map(t => String(t).toLowerCase())
            });
          });
        }
      });

      // Cross-reference Network Graph Edges
      networkEdges.forEach(edge => {
        const fromNode = nodeMap[edge.from];
        const toNode = nodeMap[edge.to];
        if (!fromNode || !toNode) return;

        const isPol = (fromNode.type === 'politician');
        const isCompanyOrInst = (toNode.type === 'company' || toNode.type === 'institution');
        const isScandal = (toNode.type === 'scandal');

        if (isPol && (isCompanyOrInst || isScandal)) {
          const polName = fromNode.label;
          const entityOrProject = toNode.label;
          const relation = edge.label || 'Connected to';

          const alreadyIndexed = indexRecords.some(r =>
            r.politicianName.toLowerCase().includes(polName.toLowerCase()) &&
            r.sentence.toLowerCase().includes(entityOrProject.toLowerCase())
          );

          if (!alreadyIndexed) {
            indexRecords.push({
              type: 'network_edge',
              politicianName: polName,
              politicianId: fromNode.id,
              county: 'Kenya',
              entityName: entityOrProject,
              scandalName: edge.label,
              amount: 'Network Link',
              rawAmount: 0,
              status: 'Mapped in Graph',
              year: 2024,
              summary: `${polName} → [${relation}] → ${entityOrProject}`,
              sentence: `${polName} is connected to ${entityOrProject} via "${relation}".`,
              evidenceCount: 0,
              evidenceList: [],
              tokens: [polName, fromNode.id, entityOrProject, toNode.id, relation, 'network', 'graph'].map(t => String(t).toLowerCase())
            });
          }
        }
      });

      // Index OSINT Leaks Archive
      const validLeaks = Array.isArray(leaksData) ? leaksData : [];
      validLeaks.forEach(leak => {
        const filename = leak.filename || 'leak_document';
        const fileType = (leak.file_type || 'txt').toUpperCase();
        const snippet = leak.snippet || '';
        const ghUrl = leak.github_url || `https://github.com/ngesa-cloud/25-june-2024/blob/main/data/leaks/${filename}`;
        
        // Clean display snippet
        const firstLine = snippet.split('\n').filter(Boolean)[0] || filename;
        const displaySnippet = snippet.length > 175 ? snippet.slice(0, 175) + '...' : snippet;

        indexRecords.push({
          type: 'leak_file',
          id: leak.id,
          filename: filename,
          fileType: fileType,
          politicianName: 'OSINT Whistleblower Archive',
          politicianId: leak.id,
          county: 'OSINT Leak',
          entityName: filename,
          scandalName: `Leaked OSINT File: ${filename}`,
          amount: 'LEAKED EVIDENCE',
          rawAmount: 0,
          status: 'Whistleblower Document',
          year: 2024,
          summary: displaySnippet,
          sentence: `[LEAK] ${filename}: "${displaySnippet.replace(/\s+/g, ' ')}"`,
          githubUrl: ghUrl,
          evidenceCount: 1,
          evidenceList: [],
          tokens: [
            filename, leak.id, fileType, 'leak', 'leaked', 'whistleblower', 'osint', 'secret',
            ...filename.toLowerCase().replace(/\./g, '_').split('_'),
            ...snippet.toLowerCase().split(/[\s,;:="'+*#\/\\<>\[\]{}()_]+/).filter(w => w.length > 2)
          ].map(t => String(t).toLowerCase())
        });
      });

      // Index Nairobi Properties
      const validProps = Array.isArray(propertiesData) ? propertiesData : [];
      validProps.forEach(prop => {
        const owner = prop.owner || 'Unknown Politician';
        const propName = prop.property_name || 'Prime Real Estate';
        const loc = prop.location || 'Nairobi';
        const valKsh = `Ksh ${prop.value_ksh}`;
        const rawVal = prop.value_numeric || parseAmountToNumber(prop.value_ksh);
        const status = prop.status || 'Verified';
        const summary = prop.summary || '';

        indexRecords.push({
          type: 'property_record',
          politicianName: owner,
          politicianId: prop.politician_id || 'william-ruto',
          county: loc,
          entityName: propName,
          scandalName: propName,
          amount: valKsh,
          rawAmount: rawVal,
          status: status,
          year: 2024,
          summary: summary,
          sentence: `[PROPERTY] ${owner}: ${propName} in ${loc} (${valKsh}) — ${status}`,
          targetUrl: 'nairobi-property.html',
          evidenceCount: 1,
          evidenceList: [],
          tokens: [
            owner, propName, loc, status, valKsh, summary, prop.category || '', prop.source || '',
            'property', 'land', 'real estate', 'karen', 'lavington', 'muthaiga', 'langata'
          ].map(t => String(t).toLowerCase())
        });
      });

      // Index NSE Insider Equities
      const validNse = Array.isArray(nseData) ? nseData : [];
      validNse.forEach(item => {
        const ticker = item.ticker || 'NSE';
        const company = item.company_name || 'Listed PLC';
        const deal = item.transaction_title || 'Equity Concession';
        const polName = item.politician_name || 'State Principal';
        const capKsh = item.capital_ksh || 'Ksh 0';
        const rawCap = item.capital_numeric || parseAmountToNumber(capKsh);
        const status = item.status || 'Active';
        const year = item.transaction_year || 2024;
        const summary = item.summary || '';

        indexRecords.push({
          type: 'nse_equity',
          ticker: ticker,
          politicianName: polName,
          politicianId: item.politician_id || 'william-ruto',
          county: item.sector || 'Equities',
          entityName: `${company} (${ticker})`,
          scandalName: deal,
          amount: capKsh,
          rawAmount: rawCap,
          status: status,
          year: year,
          summary: summary,
          sentence: `[NSE ${ticker}] ${company}: ${deal} — ${polName} (${capKsh})`,
          targetUrl: 'nse-ledger.html',
          evidenceCount: 1,
          evidenceList: [],
          tokens: [
            ticker, company, deal, polName, item.sector || '', item.regulatory_body || '', status, capKsh, String(year), summary,
            'nse', 'stock', 'equity', 'shares', 'insider', 'cma'
          ].map(t => String(t).toLowerCase())
        });
      });

      // Index Kenya Market Watch Suspicious Trades
      const validMw = Array.isArray(marketWatchData) ? marketWatchData : [];
      validMw.forEach(mw => {
        const ticker = mw.ticker || 'NSE';
        const company = mw.company || 'Listed PLC';
        const date = mw.date || '2024';
        const pattern = mw.pattern_detected || '';
        const level = mw.suspicion_level || 'HIGH';
        const valKsh = mw.value_ksh ? `Ksh ${mw.value_ksh}` : 'Undisclosed';
        const rawVal = parseAmountToNumber(mw.value_ksh);
        const linked = mw.linked_politician || 'Under CMA Review';
        const year = parseInt(date.split('-')[0]) || 2024;

        indexRecords.push({
          type: 'market_watch',
          ticker: ticker,
          politicianName: linked,
          politicianId: 'william-ruto',
          county: 'NSE Trade Anomaly',
          entityName: `${company} (${ticker})`,
          scandalName: `Trade Spike: ${ticker} (${date})`,
          amount: valKsh,
          rawAmount: rawVal,
          status: `${level} Suspicion`,
          year: year,
          summary: pattern,
          sentence: `[MARKET WATCH: ${ticker}] ${company} (${date}) — ${pattern}`,
          targetUrl: 'nse-tracker.html',
          evidenceCount: 1,
          evidenceList: [],
          tokens: [
            ticker, company, pattern, linked, level, date, valKsh, String(mw.volume || ''),
            'insider', 'market watch', 'suspicious trade', 'volume spike', 'nse', 'cma', 'front running'
          ].map(t => String(t).toLowerCase())
        });
      });

      searchIndex = indexRecords;
      isLoaded = true;
      return searchIndex;
    } catch (err) {
      console.error('Error initializing search index:', err);
      return [];
    }
  }

  // Query engine
  function search(query, limit = 8) {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];

    const cleanTokens = q.split(/\s+/).filter(Boolean);
    const matches = [];

    searchIndex.forEach(item => {
      let score = 0;
      let matchedTerm = false;

      cleanTokens.forEach(token => {
        if (/^\d+[bm]?$/i.test(token)) {
          const numPart = token.replace(/[bm]/gi, '');
          if (item.tokens.some(t => t.includes(token) || t.includes(numPart))) {
            score += 15;
            matchedTerm = true;
          }
        }

        if (item.entityName.toLowerCase().includes(token)) {
          score += 25;
          matchedTerm = true;
        }

        if (item.politicianName.toLowerCase().includes(token)) {
          score += 20;
          matchedTerm = true;
        }

        if (item.scandalName.toLowerCase().includes(token)) {
          score += 20;
          matchedTerm = true;
        }

        if (item.county && item.county.toLowerCase().includes(token)) {
          score += 18;
          matchedTerm = true;
        }

        if (item.tokens.some(t => t.includes(token))) {
          score += 10;
          matchedTerm = true;
        }
      });

      if (item.type === 'financial_scandal') score += 5;
      if (item.type === 'leak_file') score += 12;
      if (item.evidenceCount > 0) score += 3;

      if (matchedTerm && score > 0) {
        matches.push({ item, score });
      }
    });

    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.item.rawAmount || 0) - (a.item.rawAmount || 0);
    });

    return matches.slice(0, limit).map(m => m.item);
  }

  // Render search results UI
  function renderDropdown(results, query, container, inputEl) {
    let dropdown = container.querySelector('.global-search-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'global-search-dropdown';
      container.appendChild(dropdown);
    }
    activeDropdown = dropdown;

    if (!results || results.length === 0) {
      dropdown.innerHTML = `
        <div class="search-empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">No direct connections found for <strong>"${escapeHtml(query)}"</strong>.</div>
          <div class="empty-hint">Try searching: <code>Sakaja</code>, <code>Nairobi</code>, <code>Adani</code>, <code>KETRACO</code>, <code>Auditor General</code>, <code>Ksh 21B</code>, or <code>Impeachment</code>.</div>
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    let html = `
      <div class="search-results-header">
        <span class="results-count">${results.length} Investigation Match${results.length === 1 ? '' : 'es'}</span>
        <span class="results-tip">Press <code>Esc</code> to dismiss</span>
      </div>
      <div class="search-results-list">
    `;

    results.forEach((res, idx) => {
      const isLeak = res.type === 'leak_file';
      const isScandal = res.type === 'financial_scandal';
      const isProperty = res.type === 'property_record';
      const isNSE = res.type === 'nse_equity';
      const isMarketWatch = res.type === 'market_watch';

      let badgeClass = 'badge-network';
      let badgeText = 'NETWORK GRAPH';
      if (isLeak) { badgeClass = 'badge-leak'; badgeText = 'LEAKED FILE'; }
      else if (isMarketWatch) { badgeClass = 'badge-market-watch'; badgeText = 'MARKET WATCH'; }
      else if (isProperty) { badgeClass = 'badge-property'; badgeText = 'PROPERTY'; }
      else if (isNSE) { badgeClass = 'badge-nse'; badgeText = 'NSE EQUITIES'; }
      else if (isScandal) { badgeClass = 'badge-scandal'; badgeText = 'MONEY TRAIL'; }
      else if (res.type === 'promise') { badgeClass = 'badge-promise'; badgeText = 'PROMISE'; }

      let targetUrl = `profile.html?id=${encodeURIComponent(res.politicianId)}`;
      let targetAttr = '';
      if (isLeak) {
        targetUrl = res.githubUrl;
        targetAttr = 'target="_blank" rel="noopener noreferrer"';
      } else if (isMarketWatch) {
        targetUrl = 'nse-tracker.html';
      } else if (isProperty) {
        targetUrl = 'nairobi-property.html';
      } else if (isNSE) {
        targetUrl = 'nse-ledger.html';
      }

      const evBadge = (!isLeak && res.evidenceCount > 0)
        ? `<span class="result-ev-count" title="${res.evidenceCount} verified documents in Evidence Locker">🗄 ${res.evidenceCount} Evidences</span>` 
        : '';

      const countyBadge = res.county 
        ? `<span class="result-county-badge ${isLeak ? 'county-leak' : ''}">${escapeHtml(res.county)}</span>` 
        : '';

      const extraFileBadge = isLeak 
        ? `<span class="result-filetype">${escapeHtml(res.fileType)}</span>` 
        : '';

      html += `
        <a href="${escapeHtml(targetUrl)}" ${targetAttr} class="search-result-item ${isLeak ? 'item-leak' : (isMarketWatch ? 'item-market-watch' : (isProperty ? 'item-property' : (isNSE ? 'item-nse' : '')))}" data-index="${idx}">
          <div class="result-top-row">
            <span class="result-badge ${badgeClass}">${badgeText}</span>
            ${extraFileBadge}
            ${countyBadge}
            ${res.amount && res.amount !== 'Manifesto Commitment' ? `<span class="result-amount ${isLeak ? 'amount-leak' : ''}">${escapeHtml(res.amount)}</span>` : ''}
            <span class="result-year">${res.year}</span>
            ${evBadge}
            <span class="result-status status-pill ${isLeak ? 'status-leak' : ''}">${escapeHtml(res.status)}</span>
          </div>
          <div class="result-sentence ${isLeak ? 'sentence-leak' : ''}">
            ${highlightTerms(res.sentence, query)}
          </div>
          <div class="result-meta">
            ${isLeak 
              ? `<span class="meta-entity">📂 <strong>File:</strong> ${escapeHtml(res.filename)}</span><span class="meta-politician" style="color:var(--crimson-soft); margin-left:auto;">🔓 View Raw Leak on GitHub &nearr;</span>`
              : `<span class="meta-entity">🏢 <strong>Entity:</strong> ${escapeHtml(res.entityName)}</span><span class="meta-politician">👤 <strong>Dossier:</strong> ${escapeHtml(res.politicianName)}</span>`
            }
          </div>
        </a>
      `;
    });

    html += `
      </div>
      <div class="search-results-footer" style="display:flex; justify-content:space-between; align-items:center;">
        <a href="contribute.html" class="search-view-all" style="color:var(--amber-soft);">
          ✍ Propose a New Politician or Evidence &nearr;
        </a>
        <a href="money-trail.html?q=${encodeURIComponent(query)}" class="search-view-all">
          View full ledger results in Financial Ledger &rarr;
        </a>
      </div>
    `;

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightTerms(text, query) {
    if (!query) return escapeHtml(text);
    const words = query.trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return escapeHtml(text);
    
    let escaped = escapeHtml(text);
    words.forEach(word => {
      const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      escaped = escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    });
    return escaped;
  }

  function attachSearch(container) {
    const input = container.querySelector('input.global-search-input');
    if (!input) return;

    input.addEventListener('focus', () => initSearchIndex());
    container.addEventListener('mouseenter', () => initSearchIndex());

    input.addEventListener('input', async (e) => {
      const val = e.target.value.trim();
      if (!isLoaded) {
        await initSearchIndex();
      }

      if (val.length === 0) {
        const dropdown = container.querySelector('.global-search-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        return;
      }

      const results = search(val, 7);
      renderDropdown(results, val, container, input);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const dropdown = container.querySelector('.global-search-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        input.blur();
      } else if (e.key === 'Enter') {
        const dropdown = container.querySelector('.global-search-dropdown');
        const firstItem = dropdown ? dropdown.querySelector('.search-result-item') : null;
        if (firstItem) {
          window.location.href = firstItem.href;
        } else if (input.value.trim()) {
          window.location.href = `money-trail.html?q=${encodeURIComponent(input.value.trim())}`;
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        const dropdown = container.querySelector('.global-search-dropdown');
        if (dropdown) dropdown.style.display = 'none';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.global-search-component').forEach(attachSearch);
    
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const firstInput = document.querySelector('.global-search-input');
        if (firstInput) {
          firstInput.focus();
          firstInput.select();
        }
      } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const firstInput = document.querySelector('.global-search-input');
        if (firstInput) {
          firstInput.focus();
          firstInput.select();
        }
      }
    });
  });

  // Investigations Dropdown Toggle Handler
  window.toggleInvestigationsMenu = function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const menu = document.getElementById('investigations-dropdown');
    const btn = document.getElementById('investigations-menu-btn');
    if (!menu) return;
    const isShown = menu.classList.contains('show');
    if (isShown) {
      menu.classList.remove('show');
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
      }
    } else {
      menu.classList.add('show');
      if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
      }
    }
  };

  document.addEventListener('click', (e) => {
    const wrap = e.target.closest('.dropdown-container');
    if (!wrap) {
      const menu = document.getElementById('investigations-dropdown');
      const btn = document.getElementById('investigations-menu-btn');
      if (menu) menu.classList.remove('show');
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // =====================================================================
  // UNIFIED SITE MENU CONTROLLER
  // =====================================================================
  window.toggleSiteMenu = function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const overlay = document.getElementById('site-menu-overlay');
    const btn = document.getElementById('site-menu-btn');
    if (!overlay) return;

    const isOpen = overlay.classList.contains('open');
    if (isOpen) {
      window.closeSiteMenu();
    } else {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
      }

      // Sync soundtrack status badge
      const trackBtn = document.getElementById('soundtrack-btn');
      const badge = document.getElementById('menu-soundtrack-badge');
      if (trackBtn && badge) {
        const isPlaying = trackBtn.classList.contains('is-playing');
        badge.textContent = isPlaying ? 'PLAYING ⏸' : 'PAUSED ▶';
        badge.className = isPlaying ? 'card-badge badge-green' : 'card-badge badge-cyan';
      }
    }
  };

  window.closeSiteMenu = function (e) {
    if (e) {
      e.stopPropagation();
    }
    const overlay = document.getElementById('site-menu-overlay');
    const btn = document.getElementById('site-menu-btn');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    if (btn) {
      btn.classList.remove('active');
      btn.setAttribute('aria-expanded', 'false');
    }
  };

  window.handleMenuExposeRandom = async function () {
    window.closeSiteMenu();
    if (typeof window.exposeRandomPolitician === 'function') {
      window.exposeRandomPolitician();
      return;
    }

    // Fallback: pick random politician slug and navigate to profile.html
    const fallbackSlugs = [
      'william-ruto', 'johnson-sakaja', 'edwin-sifuna', 'robert-alai',
      'rigathi-gachagua', 'raila-odinga', 'kalonzo-musyoka'
    ];
    try {
      const base = getApiBase();
      const res = await fetch(`${base}politicians/index.json`).catch(() => null);
      const slugs = res && res.ok ? await res.json() : fallbackSlugs;
      const randomSlug = slugs[Math.floor(Math.random() * slugs.length)];
      window.location.href = `profile.html?id=${encodeURIComponent(randomSlug)}`;
    } catch {
      window.location.href = `profile.html?id=william-ruto`;
    }
  };

  window.handleMenuToggleSoundtrack = function () {
    const trackBtn = document.getElementById('soundtrack-btn');
    if (trackBtn) {
      trackBtn.click();
      const isPlaying = trackBtn.classList.contains('is-playing');
      const badge = document.getElementById('menu-soundtrack-badge');
      if (badge) {
        badge.textContent = isPlaying ? 'PLAYING ⏸' : 'PAUSED ▶';
        badge.className = isPlaying ? 'card-badge badge-green' : 'card-badge badge-cyan';
      }
    } else {
      // If soundtrack is on index.html, prompt navigation or play sound
      const badge = document.getElementById('menu-soundtrack-badge');
      if (badge) badge.textContent = 'OPENING INDEX...';
      window.location.href = 'index.html?soundtrack=1';
    }
  };

  // Close menu on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('site-menu-overlay');
      if (overlay && overlay.classList.contains('open')) {
        window.closeSiteMenu();
      }
    }
  });

  window.AgyGlobalSearch = {
    init: initSearchIndex,
    search: search,
    attach: attachSearch
  };
})();
