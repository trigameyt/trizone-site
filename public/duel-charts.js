const TrizoneDuelsUI = (() => {
  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function svgChart(stat, history) {
    const required = safeNumber(stat?.placement_games_required, 10) || 10;
    const points = Array.isArray(history?.points) ? history.points : [];
    const rankedNow = stat?.ranked === true;
    const source = rankedNow
      ? points.filter((p) => p.ranked && Number.isFinite(Number(p.elo))).map((p) => ({ x: safeNumber(p.games), y: safeNumber(p.elo), p }))
      : points.map((p) => ({ x: safeNumber(p.games), y: Math.min(required, safeNumber(p.games)), p }));

    const currentGames = safeNumber(stat?.games, safeNumber(stat?.wins) + safeNumber(stat?.losses));
    if (!source.length) {
      source.push({ x: currentGames, y: rankedNow ? safeNumber(stat?.elo, 300) : Math.min(required, currentGames), p: { games: currentGames, elo: stat?.elo, ranked: rankedNow } });
    }

    const width = 760, height = 260, padL = 54, padR = 22, padT = 22, padB = 42;
    let minX = Math.min(...source.map((p) => p.x));
    let maxX = Math.max(...source.map((p) => p.x));
    if (minX === maxX) { minX = Math.max(0, minX - 1); maxX += 1; }
    let minY, maxY;
    if (rankedNow) {
      minY = Math.min(...source.map((p) => p.y));
      maxY = Math.max(...source.map((p) => p.y));
      const spread = Math.max(40, maxY - minY);
      minY = Math.max(0, Math.floor((minY - spread * .18) / 25) * 25);
      maxY = Math.ceil((maxY + spread * .18) / 25) * 25;
      if (minY === maxY) maxY = minY + 100;
    } else {
      minY = 0; maxY = required;
    }
    const sx = (x) => padL + ((x - minX) / (maxX - minX)) * (width - padL - padR);
    const sy = (y) => padT + (1 - ((y - minY) / (maxY - minY))) * (height - padT - padB);
    const coords = source.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const circles = source.map((point, index) => {
      const label = rankedNow
        ? `${point.p.games} matchs · ${point.p.elo} ELO`
        : `${point.p.games}/${required} matchs de placement`;
      return `<circle cx="${sx(point.x).toFixed(1)}" cy="${sy(point.y).toFixed(1)}" r="${index === source.length - 1 ? 5 : 3.5}" tabindex="0"><title>${Trizone.escapeHtml(label)}</title></circle>`;
    }).join('');

    const yTop = rankedNow ? `${Math.round(maxY)} ELO` : `${required}/10`;
    const yBottom = rankedNow ? `${Math.round(minY)} ELO` : '0/10';
    const xLeft = `${Math.round(source[0].x)} matchs`;
    const xRight = `${Math.round(source[source.length - 1].x)} matchs`;
    return `<div class="duel-chart-wrap">
      <svg class="duel-progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Progression ${rankedNow ? 'ELO' : 'des matchs de placement'}">
        <defs><linearGradient id="duelChartGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7444ff"/><stop offset=".55" stop-color="#bd5cff"/><stop offset="1" stop-color="#e69cff"/></linearGradient></defs>
        <line class="chart-grid" x1="${padL}" y1="${sy(maxY)}" x2="${width-padR}" y2="${sy(maxY)}"/>
        <line class="chart-grid" x1="${padL}" y1="${sy(minY)}" x2="${width-padR}" y2="${sy(minY)}"/>
        <polyline class="chart-line" points="${coords}"/>
        <g class="chart-points">${circles}</g>
        <text class="chart-axis-label" x="8" y="${padT+5}">${Trizone.escapeHtml(yTop)}</text>
        <text class="chart-axis-label" x="8" y="${height-padB+5}">${Trizone.escapeHtml(yBottom)}</text>
        <text class="chart-axis-label chart-axis-bottom" x="${padL}" y="${height-12}">${Trizone.escapeHtml(xLeft)}</text>
        <text class="chart-axis-label chart-axis-bottom" text-anchor="end" x="${width-padR}" y="${height-12}">${Trizone.escapeHtml(xRight)}</text>
      </svg>
    </div>`;
  }

  function historyPanel(stat, history) {
    if (!stat) return '<div class="notice bad">Kit introuvable.</div>';
    const games = safeNumber(stat.games, safeNumber(stat.wins) + safeNumber(stat.losses));
    const required = safeNumber(stat.placement_games_required, 10) || 10;
    const status = stat.ranked
      ? `<strong>${safeNumber(stat.elo)} ELO</strong><span class="${duelTierClassForShared(stat.tier)}">${Trizone.escapeHtml(stat.tier)}</span>`
      : `<strong>UNRANKED</strong><span>${games}/${required} placements</span>`;
    return `<section class="duel-history-panel">
      <div class="duel-history-head">
        <div><span class="eyebrow-mini">Progression du kit</span><h4>${Trizone.minecraftIconHtml(stat.icon, stat.emoji || '⚔', 'mc-icon-inline')} ${Trizone.escapeHtml(stat.name || stat.kit)}</h4></div>
        <div class="duel-history-current ${stat.ranked ? 'ranked' : 'unranked'}">${status}</div>
      </div>
      ${svgChart(stat, history)}
      <div class="duel-history-foot"><span>${safeNumber(stat.wins)}W / ${safeNumber(stat.losses)}L</span><span>${safeNumber(stat.kills)} kills</span><span>KDR ${Trizone.escapeHtml(String(stat.kdr ?? 0))}</span><span>${stat.ranked ? 'ELO visible' : 'ELO masqué jusqu’au 10e match'}</span></div>
    </section>`;
  }

  function duelTierClassForShared(tier) {
    return `duel-tier tier-${String(tier || 'unranked').toLowerCase()}`;
  }

  return { historyPanel, svgChart };
})();
