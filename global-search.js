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

      const [politicians, networkData, leaksData] = await Promise.all([
        Promise.all(politicianPromises),
        networkPromise,
        leaksPromise
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
      const badgeClass = isLeak ? 'badge-leak' : (isScandal ? 'badge-scandal' : (res.type === 'promise' ? 'badge-promise' : 'badge-network'));
      const badgeText = isLeak ? 'LEAKED FILE' : (isScandal ? 'MONEY TRAIL' : (res.type === 'promise' ? 'PROMISE' : 'NETWORK GRAPH'));
      
      const targetUrl = isLeak ? res.githubUrl : `profile.html?id=${encodeURIComponent(res.politicianId)}`;
      const targetAttr = isLeak ? 'target="_blank" rel="noopener noreferrer"' : '';

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
        <a href="${escapeHtml(targetUrl)}" ${targetAttr} class="search-result-item ${isLeak ? 'item-leak' : ''}" data-index="${idx}">
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

  window.AgyGlobalSearch = {
    init: initSearchIndex,
    search: search,
    attach: attachSearch
  };
})();
