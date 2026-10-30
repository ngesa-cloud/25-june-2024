/**
 * Global Search Engine for 25.06.2024 Accountability Platform
 * Cross-references Politician JSON Dossiers and Network Connection Graph
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
        // fallback to alternative relative path
        indexRes = await fetch('api/politicians/index.json').catch(() => null);
      }
      const slugs = indexRes && indexRes.ok ? await indexRes.json() : ['william-ruto', 'raila-odinga', 'rigathi-gachagua', 'kalonzo-musyoka'];

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

      const [politicians, networkData] = await Promise.all([
        Promise.all(politicianPromises),
        networkPromise
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

            // The mandatory relationship sentence
            const connectionSentence = `${polName} is connected to ${entity} regarding ${scandalName} (${amount}).`;

            indexRecords.push({
              type: 'financial_scandal',
              politicianName: polName,
              politicianId: polId,
              entityName: entity,
              scandalName: scandalName,
              amount: amount,
              rawAmount: rawAmount,
              status: status,
              year: year,
              summary: summary,
              sentence: connectionSentence,
              tokens: [
                polName, polId, entity, scandalName, amount, status, String(year), summary, party, position,
                amount.replace(/\s+/g, ''), // e.g. "30B", "30Billion"
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
            const evidence = prom.evidence || '';

            indexRecords.push({
              type: 'promise',
              politicianName: polName,
              politicianId: polId,
              entityName: 'Electorate of Kenya',
              scandalName: promiseText,
              amount: 'Manifesto Commitment',
              rawAmount: 0,
              status: status,
              year: year,
              summary: evidence,
              sentence: `${polName} pledged: "${promiseText}" (${status}).`,
              tokens: [polName, polId, promiseText, status, String(year), evidence, party, 'promise', 'manifesto']
                .map(t => String(t).toLowerCase())
            });
          });
        }
      });

      // Cross-reference Network Graph Edges for any company/institution links
      networkEdges.forEach(edge => {
        const fromNode = nodeMap[edge.from];
        const toNode = nodeMap[edge.to];
        if (!fromNode || !toNode) return;

        // If edge connects politician to company/institution or scandal
        const isPol = (fromNode.type === 'politician');
        const isCompanyOrInst = (toNode.type === 'company' || toNode.type === 'institution');
        const isScandal = (toNode.type === 'scandal');

        if (isPol && (isCompanyOrInst || isScandal)) {
          const polName = fromNode.label;
          const entityOrProject = toNode.label;
          const relation = edge.label || 'Connected to';

          // Avoid exact duplicate sentences
          const alreadyIndexed = indexRecords.some(r =>
            r.politicianName.toLowerCase().includes(polName.toLowerCase()) &&
            r.sentence.toLowerCase().includes(entityOrProject.toLowerCase())
          );

          if (!alreadyIndexed) {
            indexRecords.push({
              type: 'network_edge',
              politicianName: polName,
              politicianId: fromNode.id,
              entityName: entityOrProject,
              scandalName: edge.label,
              amount: 'Network Link',
              rawAmount: 0,
              status: 'Mapped in Graph',
              year: 2024,
              summary: `${polName} → [${relation}] → ${entityOrProject}`,
              sentence: `${polName} is connected to ${entityOrProject} via "${relation}".`,
              tokens: [polName, fromNode.id, entityOrProject, toNode.id, relation, 'network', 'graph'].map(t => String(t).toLowerCase())
            });
          }
        }
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

    // Clean search tokens (e.g. handle "30b", "30 billion", "ksh 30b")
    const cleanTokens = q.split(/\s+/).filter(Boolean);

    const matches = [];

    searchIndex.forEach(item => {
      let score = 0;
      let matchedTerm = false;

      // Check for direct token matches
      cleanTokens.forEach(token => {
        // Special case: numeric amount e.g. "30b" or "30"
        if (/^\d+[bm]?$/i.test(token)) {
          const numPart = token.replace(/[bm]/gi, '');
          if (item.tokens.some(t => t.includes(token) || t.includes(numPart))) {
            score += 15;
            matchedTerm = true;
          }
        }

        // Entity name match (e.g. "adani", "ketraco", "world bank", "spectre", "nys")
        if (item.entityName.toLowerCase().includes(token)) {
          score += 25;
          matchedTerm = true;
        }

        // Politician name match (e.g. "ruto", "raila", "gachagua", "kalonzo")
        if (item.politicianName.toLowerCase().includes(token)) {
          score += 20;
          matchedTerm = true;
        }

        // Scandal / project name match
        if (item.scandalName.toLowerCase().includes(token)) {
          score += 20;
          matchedTerm = true;
        }

        // Summary or generic tokens
        if (item.tokens.some(t => t.includes(token))) {
          score += 10;
          matchedTerm = true;
        }
      });

      // Priority boost for financial scandals over promises
      if (item.type === 'financial_scandal') score += 5;

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
          <div class="empty-hint">Try searching: <code>Adani</code>, <code>KETRACO</code>, <code>Ksh 30B</code>, <code>Ruto</code>, <code>Gachagua</code>, <code>World Bank</code>, or <code>Impeachment</code>.</div>
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
      const isScandal = res.type === 'financial_scandal';
      const badgeClass = isScandal ? 'badge-scandal' : (res.type === 'promise' ? 'badge-promise' : 'badge-network');
      const badgeText = isScandal ? 'MONEY TRAIL' : (res.type === 'promise' ? 'PROMISE' : 'NETWORK GRAPH');
      
      const targetUrl = isScandal 
        ? `money-trail.html?q=${encodeURIComponent(res.entityName.split(/[\s/]+/)[0])}#${res.politicianId}`
        : (res.type === 'promise' ? `promises-plunder.html#${res.politicianId}` : `scandal-graph.html`);

      html += `
        <a href="${targetUrl}" class="search-result-item" data-index="${idx}">
          <div class="result-top-row">
            <span class="result-badge ${badgeClass}">${badgeText}</span>
            ${res.amount && res.amount !== 'Manifesto Commitment' ? `<span class="result-amount">${escapeHtml(res.amount)}</span>` : ''}
            <span class="result-year">${res.year}</span>
            <span class="result-status status-pill">${escapeHtml(res.status)}</span>
          </div>
          <div class="result-sentence">
            ${highlightTerms(res.sentence, query)}
          </div>
          <div class="result-meta">
            <span class="meta-entity">🏢 <strong>Entity:</strong> ${escapeHtml(res.entityName)}</span>
            <span class="meta-politician">👤 <strong>Dossier:</strong> ${escapeHtml(res.politicianName)}</span>
          </div>
        </a>
      `;
    });

    html += `
      </div>
      <div class="search-results-footer">
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

  // Mount search component onto DOM elements
  function attachSearch(container) {
    const input = container.querySelector('input.global-search-input');
    if (!input) return;

    // Trigger preload on focus or hover
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

    // Close on escape
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

    // Global click listener to close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        const dropdown = container.querySelector('.global-search-dropdown');
        if (dropdown) dropdown.style.display = 'none';
      }
    });
  }

  // Auto-init on page load
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.global-search-component').forEach(attachSearch);
    
    // Global keyboard shortcut: Ctrl+K or / to focus search
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

  // Export search helpers for pages that need programmatic search
  window.AgyGlobalSearch = {
    init: initSearchIndex,
    search: search,
    attach: attachSearch
  };
})();
