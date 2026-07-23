(function () {
  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeSearch(text) {
    return String(text ?? "").toLowerCase().replace(/\s+/g, "");
  }

  function cardText(card) {
    return [card.title, card.group, card.quote, card.note, card.prompt, ...(card.content || [])].join("");
  }

  function renderOptions(groups) {
    return groups.map((group) => '<option value="' + escapeHtml(group) + '">' + escapeHtml(group) + "</option>").join("");
  }

  function renderFullText(card) {
    const content = card.content || [];
    if (!content.length) return "";

    return (
      '<details class="fulltext">' +
      '<summary>完整正文 · ' +
      content.length +
      " 段</summary>" +
      '<div class="fulltext-body">' +
      content.map((line) => "<p>" + escapeHtml(line) + "</p>").join("") +
      "</div>" +
      "</details>"
    );
  }

  function renderPlaceholder(card) {
    return (
      '<div class="placeholder" style="background:' +
      escapeHtml(card.color || "#e5e7eb") +
      ';">PURE COLOR PLACEHOLDER</div>'
    );
  }

  function renderVisual(card) {
    if (card.image) {
      return (
        '<figure class="visual" data-fallback-color="' +
        escapeHtml(card.color || "#e5e7eb") +
        '">' +
        '<img src="' +
        escapeHtml(card.image) +
        '" alt="' +
        escapeHtml(card.title + " 图册配图") +
        '" loading="lazy" />' +
        "</figure>"
      );
    }

    return renderPlaceholder(card);
  }

  function renderCards(cards) {
    return cards
      .map(function (card, index) {
        return (
          '<article class="card" data-card data-group="' +
          escapeHtml(card.group) +
          '" data-search="' +
          escapeHtml(normalizeSearch(cardText(card))) +
          '">' +
          '<div class="card-head">' +
          "<div>" +
          '<div class="index-badge">' +
          escapeHtml(card.group || "Atlas") +
          " · " +
          String(index + 1).padStart(3, "0") +
          "</div>" +
          '<h2 class="card-title">' +
          escapeHtml(card.title) +
          "</h2>" +
          "</div>" +
          '<div class="mood">' +
          escapeHtml(card.mood) +
          "</div>" +
          "</div>" +
          renderVisual(card) +
          '<div class="card-body">' +
          '<p class="quote">' +
          escapeHtml(card.quote) +
          "</p>" +
          '<p class="note">' +
          escapeHtml(card.note) +
          "</p>" +
          renderFullText(card) +
          '<div class="prompt-label">Prompt</div>' +
          '<pre class="prompt">' +
          escapeHtml(card.prompt) +
          "</pre>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function attachFilters(root) {
    const search = root.querySelector("[data-search-input]");
    const group = root.querySelector("[data-group-filter]");
    const counter = root.querySelector("[data-counter]");
    const cards = Array.from(root.querySelectorAll("[data-card]"));

    function apply() {
      const query = normalizeSearch(search.value);
      const activeGroup = group.value;
      let shown = 0;

      cards.forEach((card) => {
        const matchesSearch = !query || card.dataset.search.includes(query);
        const matchesGroup = !activeGroup || card.dataset.group === activeGroup;
        const visible = matchesSearch && matchesGroup;
        card.hidden = !visible;
        if (visible) shown += 1;
      });

      counter.textContent = shown + " / " + cards.length;
    }

    search.addEventListener("input", apply);
    group.addEventListener("change", apply);
    apply();
  }

  function attachImageFallbacks(root) {
    root.querySelectorAll(".visual img").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          const figure = img.closest(".visual");
          if (!figure) return;

          const fallback = document.createElement("div");
          fallback.className = "placeholder";
          fallback.style.background = figure.dataset.fallbackColor || "#e5e7eb";
          fallback.textContent = "PURE COLOR PLACEHOLDER";
          figure.replaceWith(fallback);
        },
        { once: true },
      );
    });
  }

  window.renderAtlas = function renderAtlas(data) {
    Object.entries(data.theme || {}).forEach(function ([key, value]) {
      document.body.style.setProperty("--" + key, value);
    });

    const groups = Array.from(new Set(data.cards.map((card) => card.group).filter(Boolean)));
    document.title = data.title + " 完整图册";
    document.body.innerHTML =
      '<main class="page">' +
      '<div class="topbar">' +
      '<a class="back-link" href="./index.html">返回选题索引</a>' +
      '<div class="tag">' +
      escapeHtml(data.tagline) +
      "</div>" +
      "</div>" +
      '<section class="hero">' +
      '<div class="eyebrow">' +
      escapeHtml(data.eyebrow) +
      "</div>" +
      '<div class="title-row">' +
      "<div>" +
      '<h1 class="title">' +
      escapeHtml(data.title) +
      "</h1>" +
      '<p class="subtitle">' +
      escapeHtml(data.subtitle) +
      "</p>" +
      "</div>" +
      '<div class="hero-metrics">' +
      '<div class="metric"><div class="metric-label">完整覆盖</div><div class="metric-value">' +
      escapeHtml(data.metrics.coverage) +
      "</div></div>" +
      '<div class="metric"><div class="metric-label">拆解方式</div><div class="metric-value">' +
      escapeHtml(data.metrics.breakdown) +
      "</div></div>" +
      '<div class="metric"><div class="metric-label">视觉方向</div><div class="metric-value">' +
      escapeHtml(data.metrics.visual) +
      "</div></div>" +
      '<div class="metric"><div class="metric-label">数据来源</div><div class="metric-value">' +
      escapeHtml(data.metrics.source) +
      "</div></div>" +
      "</div>" +
      "</div>" +
      '<div class="method">' +
      '<article class="method-card"><h2>选段策略</h2><p>' +
      escapeHtml(data.method.selection) +
      "</p></article>" +
      '<article class="method-card"><h2>画面逻辑</h2><p>' +
      escapeHtml(data.method.visualization) +
      "</p></article>" +
      '<article class="method-card"><h2>版式建议</h2><p>' +
      escapeHtml(data.method.layout) +
      "</p></article>" +
      "</div>" +
      "</section>" +
      '<section class="toolbar" aria-label="图册筛选">' +
      '<label><span>搜索</span><input data-search-input type="search" placeholder="标题、正文、提示词" /></label>' +
      '<label><span>分组</span><select data-group-filter><option value="">全部分组</option>' +
      renderOptions(groups) +
      "</select></label>" +
      '<div class="counter"><span data-counter>0 / 0</span></div>' +
      "</section>" +
      '<div class="section-head">' +
      '<h2 class="section-title">完整条目与提示词</h2>' +
      '<p class="section-note">图片仍为纯色占位；每张卡都保留完整正文和可直接用于图像生成的 Prompt。</p>' +
      "</div>" +
      '<section class="grid">' +
      renderCards(data.cards) +
      "</section>" +
      '<div class="footer">' +
      escapeHtml(data.footer) +
      "</div>" +
      "</main>";

    attachFilters(document);
    attachImageFallbacks(document);
  };
})();
