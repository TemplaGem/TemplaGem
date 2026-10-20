/* ==========================================================================
   TemplaGem Interactive Landing Logic
   Simulates the real Gemini Overlay, Variable Highlighter, Tab Navigation,
   Popup Sorting, Custom Prompt Creation, and UA/EN + Dark/Light Modes
   ========================================================================== */

(function () {
  const INITIAL_PROMPTS = [
    {
      id: "p-summary",
      title: "Конспект матеріалу",
      titleEn: "Structured Study Notes",
      icon: "bot",
      color: "blue",
      svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
      text: "Зроби детальний і структурований конспект за темою: {{тема}}\n\nФормат:\n1. Коротке резюме (2-3 речення)\n2. Ключові поняття та визначення\n3. Основні тези списком\n\nМатеріал:\n{{матеріал}}",
      textEn: "Create structured study notes on: {{topic}}\n\nFormat:\n1. Executive summary (2-3 sentences)\n2. Key concepts and definitions\n3. Core takeaways\n\nSource material:\n{{source_text}}",
      tags: ["навчання", "конспект"],
      tagsEn: ["study", "notes"],
      createdAt: "2026-10-18T10:00:00Z",
      updatedAt: "2026-10-19T14:00:00Z"
    },
    {
      id: "p-refactor",
      title: "Code Review & Refactor",
      titleEn: "Code Review & Refactor",
      icon: "code",
      color: "purple",
      svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      text: "Ти Senior {{мова_програмування}} розробник. Проведи рев'ю цього коду:\n\n{{код}}\n\nЗнайди потенційні баги, вузькі місця продуктивності та запропонуй чистий відрефакторений варіант.",
      textEn: "Act as a Senior {{language}} engineer. Review and refactor this code:\n\n{{code_snippet}}\n\nIdentify edge-case bugs, performance bottlenecks, and provide a clean refactored implementation.",
      tags: ["код", "dev"],
      tagsEn: ["coding", "dev"],
      createdAt: "2026-10-19T09:30:00Z",
      updatedAt: "2026-10-20T08:15:00Z"
    },
    {
      id: "p-email",
      title: "Діловий лист (Email)",
      titleEn: "Executive Email Draft",
      icon: "mail",
      color: "green",
      svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      text: "Напиши чіткий діловий лист для {{одержувач}}.\nМета листа: {{мета}}\nТон: {{тон}}\nЗапропонуй 2 варіанти теми (Subject) та текст листа.",
      textEn: "Write a concise professional email to {{recipient}}.\nGoal: {{goal}}\nTone: {{tone}}\nProvide 2 subject line options and the email body.",
      tags: ["робота", "email"],
      tagsEn: ["work", "email"],
      createdAt: "2026-10-15T12:00:00Z",
      updatedAt: "2026-10-17T18:00:00Z"
    },
    {
      id: "p-english",
      title: "Пояснення граматики / лексики",
      titleEn: "Language Tutor & Quiz",
      icon: "book",
      color: "amber",
      svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      text: "Поясни правило або вираз «{{вираз}}» для рівня {{рівень}}.\nНаведи 5 живих прикладів у реченнях, типові помилки та 3 тестові речення для самоперевірки.",
      textEn: "Explain the phrase or rule '{{expression}}' for level {{level}}.\nProvide 5 natural examples, common pitfalls, and a 3-question mini quiz.",
      tags: ["навчання", "мови"],
      tagsEn: ["study", "language"],
      createdAt: "2026-10-12T16:20:00Z",
      updatedAt: "2026-10-16T11:10:00Z"
    }
  ];

  const state = {
    lang: "uk",
    theme: "dark",
    sandboxMode: "overlay", // "overlay" | "popup"
    popoverOpen: true,
    searchQuery: "",
    activeTag: "all",
    selectedIndex: 0,
    sortOption: "created-desc",
    prompts: [...INITIAL_PROMPTS],
    activeVarIndex: 0,
    easterEggClicks: 0,
    easterEggRevealed: false,
    installTab: "release" // "release" | "source"
  };

  // DOM Elements
  const root = document.documentElement;
  const themeToggleBtn = document.getElementById("theme-toggle");
  const langToggleBtn = document.getElementById("lang-toggle");
  const tabOverlayBtn = document.getElementById("tab-overlay");
  const tabPopupBtn = document.getElementById("tab-popup");
  const overlayView = document.getElementById("sandbox-overlay-view");
  const popupView = document.getElementById("sandbox-popup-view");

  const popoverEl = document.getElementById("sim-popover");
  const popoverSearchInput = document.getElementById("sim-search");
  const popoverTagsEl = document.getElementById("sim-tags");
  const popoverListEl = document.getElementById("sim-prompt-list");
  const geminiEditorEl = document.getElementById("sim-gemini-editor");
  const geminiChatLogEl = document.getElementById("sim-chat-log");

  const btnTogglePopover = document.getElementById("btn-toggle-popover");
  const btnNextVar = document.getElementById("btn-next-var");
  const btnSendPrompt = document.getElementById("btn-send-prompt");

  const popupSearchInput = document.getElementById("popup-sim-search");
  const popupSortSelect = document.getElementById("popup-sim-sort");
  const popupCardListEl = document.getElementById("popup-sim-list");
  const popupAddForm = document.getElementById("popup-add-form");
  const btnToggleAddForm = document.getElementById("btn-toggle-add-form");
  const easterEggBox = document.getElementById("easter-egg-trigger");
  const easterEggStatus = document.getElementById("easter-egg-status");

  // Helper: Get localized prompt fields
  function getLocalizedPrompt(p) {
    const isEn = state.lang === "en";
    return {
      ...p,
      displayTitle: isEn && p.titleEn ? p.titleEn : p.title,
      displayText: isEn && p.textEn ? p.textEn : p.text,
      displayTags: isEn && p.tagsEn ? p.tagsEn : p.tags
    };
  }

  // Helper: Filter & Sort prompts
  function getFilteredPrompts(query, tagFilter, sortOpt) {
    const q = (query || "").trim().toLowerCase();
    const localized = state.prompts.map(getLocalizedPrompt);

    const filtered = localized.filter((item) => {
      const matchesTag =
        !tagFilter || tagFilter === "all" || item.displayTags.includes(tagFilter);
      const matchesQuery =
        !q ||
        item.displayTitle.toLowerCase().includes(q) ||
        item.displayText.toLowerCase().includes(q) ||
        item.displayTags.some((t) => t.toLowerCase().includes(q));
      return matchesTag && matchesQuery;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortOpt) {
        case "created-asc":
          return new Date(a.createdAt) - new Date(b.createdAt);
        case "title-asc":
          return a.displayTitle.localeCompare(b.displayTitle);
        case "title-desc":
          return b.displayTitle.localeCompare(a.displayTitle);
        case "updated-desc":
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        case "updated-asc":
          return new Date(a.updatedAt) - new Date(b.updatedAt);
        case "created-desc":
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    return sorted;
  }

  // Render Tag Chips in Overlay
  function renderTags() {
    const allLabel = state.lang === "en" ? "All" : "Усі";
    const tagSet = new Set();
    state.prompts.map(getLocalizedPrompt).forEach((p) => {
      p.displayTags.forEach((t) => tagSet.add(t));
    });

    const tags = ["all", ...Array.from(tagSet)];
    popoverTagsEl.innerHTML = tags
      .map((tag) => {
        const isActive = state.activeTag === tag;
        const label = tag === "all" ? allLabel : `#${tag}`;
        return `<button type="button" class="tag-chip ${isActive ? "active" : ""}" data-tag="${tag}">${label}</button>`;
      })
      .join("");

    popoverTagsEl.querySelectorAll(".tag-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeTag = btn.getAttribute("data-tag") || "all";
        state.selectedIndex = 0;
        renderTags();
        renderOverlayList();
      });
    });
  }

  // Render Overlay Prompt List
  function renderOverlayList() {
    const items = getFilteredPrompts(state.searchQuery, state.activeTag, "created-desc");
    if (state.selectedIndex >= items.length) {
      state.selectedIndex = Math.max(0, items.length - 1);
    }

    if (items.length === 0) {
      const emptyMsg =
        state.lang === "en"
          ? "No templates match your filter."
          : "Шаблонів за цим запитом не знайдено.";
      popoverListEl.innerHTML = `<li style="padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.8125rem;">${emptyMsg}</li>`;
      return;
    }

    popoverListEl.innerHTML = items
      .map((item, idx) => {
        const isSelected = idx === state.selectedIndex;
        const preview = item.displayText.replace(/\n+/g, " ");
        const tagsHtml = item.displayTags
          .slice(0, 2)
          .map((t) => `<span class="mini-tag">#${t}</span>`)
          .join("");

        return `
          <li class="popover-item ${isSelected ? "selected" : ""}" data-id="${item.id}" data-idx="${idx}" role="option" aria-selected="${isSelected}">
            <div class="popover-item-left">
              <span class="prompt-icon-box" data-color="${item.color}">${item.svg}</span>
              <div style="min-width: 0;">
                <div class="popover-item-title">${escapeHtml(item.displayTitle)}</div>
                <div class="popover-item-preview">${escapeHtml(preview)}</div>
              </div>
            </div>
            <div class="popover-item-tags">${tagsHtml}</div>
          </li>
        `;
      })
      .join("");

    popoverListEl.querySelectorAll(".popover-item").forEach((li) => {
      li.addEventListener("click", () => {
        const id = li.getAttribute("data-id");
        const found = items.find((p) => p.id === id);
        if (found) {
          insertTemplateIntoGemini(found.displayText);
        }
      });
    });
  }

  // Escape HTML safely
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Insert template into simulated Gemini editor with highlighted {{variable}} spans
  function insertTemplateIntoGemini(templateText) {
    const escaped = escapeHtml(templateText);
    let varIdx = 0;
    const htmlWithPills = escaped.replace(/\{\{([^{}\n]+)\}\}/g, (match, varName) => {
      const activeClass = varIdx === 0 ? "ph-template-variable-active" : "";
      const span = `<span class="ph-template-variable ${activeClass}" contenteditable="false" data-var-index="${varIdx}" data-var-name="${varName}">{{${varName}}}</span>`;
      varIdx++;
      return span;
    });

    geminiEditorEl.innerHTML = htmlWithPills;
    state.activeVarIndex = 0;
    state.popoverOpen = false;
    updatePopoverVisibility();
    bindVariablePillEvents();
    geminiEditorEl.focus();
  }

  // Attach click handlers to variable pills inside the editor
  function bindVariablePillEvents() {
    const pills = geminiEditorEl.querySelectorAll(".ph-template-variable");
    pills.forEach((pill, index) => {
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        setActiveVariablePill(index);
        promptValueForPill(pill);
      });
    });
  }

  function setActiveVariablePill(index) {
    const pills = Array.from(geminiEditorEl.querySelectorAll(".ph-template-variable"));
    if (pills.length === 0) return;
    const normalized = ((index % pills.length) + pills.length) % pills.length;
    state.activeVarIndex = normalized;
    pills.forEach((p, idx) => {
      p.classList.toggle("ph-template-variable-active", idx === normalized);
    });
  }

  function jumpToNextPill() {
    const pills = Array.from(geminiEditorEl.querySelectorAll(".ph-template-variable"));
    if (pills.length === 0) return;
    setActiveVariablePill(state.activeVarIndex + 1);
  }

  function promptValueForPill(pill) {
    geminiEditorEl.focus();
  }

  // Strip {{ and }} brackets on send (mirrors stripTemplateBrackets in src/utils/template.ts)
  function stripBrackets(text) {
    return text.replace(/\{\{([^{}\n]+)\}\}/g, "$1");
  }

  function handleSendSimulatedMessage() {
    const rawText = geminiEditorEl.innerText.trim();
    if (!rawText) return;

    const cleanText = stripBrackets(rawText);
    const metaLabel =
      state.lang === "en"
        ? "Sent to Gemini — {{brackets}} stripped automatically"
        : "Надіслано в Gemini — дужки {{...}} очищено автоматично";

    geminiChatLogEl.innerHTML = `
      <div class="sent-bubble">${escapeHtml(cleanText)}</div>
      <div class="sent-meta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polyline points="20 6 9 17 4 12"/></svg>
        <span>${metaLabel}</span>
      </div>
    `;

    geminiEditorEl.innerHTML = "";
    state.popoverOpen = true;
    updatePopoverVisibility();
  }

  function updatePopoverVisibility() {
    if (!popoverEl) return;
    popoverEl.classList.toggle("is-closed", !state.popoverOpen);
  }

  // Render Popup Simulator List
  function renderPopupSimList() {
    const q = popupSearchInput ? popupSearchInput.value : "";
    const items = getFilteredPrompts(q, "all", state.sortOption);
    const useLabel = state.lang === "en" ? "Insert in Gemini" : "Вставити в Gemini";

    popupCardListEl.innerHTML = items
      .map((item) => {
        return `
          <div class="popup-card-item">
            <div class="popover-item-left">
              <span class="prompt-icon-box" data-color="${item.color}">${item.svg}</span>
              <div style="min-width: 0;">
                <div class="popover-item-title">${escapeHtml(item.displayTitle)}</div>
                <div class="popover-item-preview" style="max-width: 210px;">${escapeHtml(item.displayText.replace(/\n+/g, " "))}</div>
              </div>
            </div>
            <button type="button" class="popup-use-btn" data-use-id="${item.id}">${useLabel}</button>
          </div>
        `;
      })
      .join("");

    popupCardListEl.querySelectorAll(".popup-use-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-use-id");
        const found = items.find((p) => p.id === id);
        if (found) {
          switchSandboxTab("overlay");
          insertTemplateIntoGemini(found.displayText);
        }
      });
    });
  }

  function switchSandboxTab(mode) {
    state.sandboxMode = mode;
    const isOverlay = mode === "overlay";
    tabOverlayBtn.setAttribute("aria-selected", String(isOverlay));
    tabPopupBtn.setAttribute("aria-selected", String(!isOverlay));
    overlayView.style.display = isOverlay ? "flex" : "none";
    popupView.style.display = isOverlay ? "none" : "block";
    if (!isOverlay) {
      renderPopupSimList();
    }
  }

  // Language Dictionary for Static Nodes
  function applyLanguage(lang) {
    state.lang = lang;
    root.setAttribute("lang", lang);
    if (langToggleBtn) {
      const activeCode = lang === "uk" ? "UA" : "EN";
      const unselectedCode = lang === "uk" ? "EN" : "UA";
      langToggleBtn.innerHTML = `<span class="lang-active-prefix">${activeCode} / </span><span id="lang-unselected-label">${unselectedCode}</span>`;
    }

    document.querySelectorAll("[data-i18n-uk]").forEach((el) => {
      const text = lang === "en" ? el.getAttribute("data-i18n-en") : el.getAttribute("data-i18n-uk");
      if (text) {
        el.textContent = text;
      }
    });

    document.querySelectorAll("[data-placeholder-uk]").forEach((el) => {
      const ph =
        lang === "en"
          ? el.getAttribute("data-placeholder-en")
          : el.getAttribute("data-placeholder-uk");
      if (ph) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.setAttribute("placeholder", ph);
        } else {
          el.setAttribute("data-placeholder", ph);
        }
      }
    });

    renderTags();
    renderOverlayList();
    renderPopupSimList();
  }

  // Theme Toggle
  function applyTheme(theme) {
    state.theme = theme;
    root.setAttribute("data-theme", theme);
    const labelEl = document.getElementById("theme-toggle-label");
    if (labelEl) {
      labelEl.textContent = theme === "dark" ? "Dark" : "Light";
    }
  }

  // Event Listeners
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });
  }

  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", () => {
      applyLanguage(state.lang === "uk" ? "en" : "uk");
    });
  }

  if (tabOverlayBtn && tabPopupBtn) {
    tabOverlayBtn.addEventListener("click", () => switchSandboxTab("overlay"));
    tabPopupBtn.addEventListener("click", () => switchSandboxTab("popup"));
  }

  if (popoverSearchInput) {
    popoverSearchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      state.selectedIndex = 0;
      renderOverlayList();
    });
  }

  if (btnTogglePopover) {
    btnTogglePopover.addEventListener("click", () => {
      state.popoverOpen = !state.popoverOpen;
      updatePopoverVisibility();
    });
  }

  if (btnNextVar) {
    btnNextVar.addEventListener("click", () => {
      jumpToNextPill();
      geminiEditorEl.focus();
    });
  }

  if (btnSendPrompt) {
    btnSendPrompt.addEventListener("click", handleSendSimulatedMessage);
  }

  // Keyboard interactions in simulated Gemini editor
  if (geminiEditorEl) {
    geminiEditorEl.addEventListener("focus", () => {
      const pills = geminiEditorEl.querySelectorAll(".ph-template-variable");
      if (pills.length === 0 && !geminiEditorEl.innerText.trim()) {
        state.popoverOpen = true;
        updatePopoverVisibility();
      }
    });

    geminiEditorEl.addEventListener("keydown", (e) => {
      const pills = Array.from(geminiEditorEl.querySelectorAll(".ph-template-variable"));
      const activePill = geminiEditorEl.querySelector(".ph-template-variable-active");

      if (e.key === "Tab" && pills.length > 0) {
        e.preventDefault();
        jumpToNextPill();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (state.popoverOpen && pills.length === 0) {
          e.preventDefault();
          const items = getFilteredPrompts(state.searchQuery, state.activeTag, "created-desc");
          if (items[state.selectedIndex]) {
            insertTemplateIntoGemini(items[state.selectedIndex].displayText);
          }
          return;
        }
        e.preventDefault();
        handleSendSimulatedMessage();
        return;
      }

      if (e.key === "Escape" && state.popoverOpen) {
        state.popoverOpen = false;
        updatePopoverVisibility();
        return;
      }

      // Replace active variable pill immediately when user starts typing a character
      if (
        activePill &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const textNode = document.createTextNode(e.key);
        activePill.replaceWith(textNode);

        // Place caret right after the inserted character
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.setStartAfter(textNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }

        // Highlight next remaining variable pill if any
        const remaining = geminiEditorEl.querySelectorAll(".ph-template-variable");
        if (remaining.length > 0) {
          setActiveVariablePill(0);
        }
      }
    });
  }

  // Popup controls
  if (popupSearchInput) {
    popupSearchInput.addEventListener("input", renderPopupSimList);
  }

  if (popupSortSelect) {
    popupSortSelect.addEventListener("change", (e) => {
      state.sortOption = e.target.value;
      renderPopupSimList();
    });
  }

  if (btnToggleAddForm && popupAddForm) {
    btnToggleAddForm.addEventListener("click", () => {
      const hidden = popupAddForm.style.display === "none";
      popupAddForm.style.display = hidden ? "flex" : "none";
    });

    popupAddForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("new-prompt-title");
      const textInput = document.getElementById("new-prompt-text");
      const tagInput = document.getElementById("new-prompt-tag");

      const title = titleInput.value.trim();
      const text = textInput.value.trim();
      const tag = (tagInput.value.trim() || "custom").replace(/^#/, "");

      if (!title || !text) return;

      const newPrompt = {
        id: "p-custom-" + Date.now(),
        title,
        titleEn: title,
        icon: "sparkles",
        color: "blue",
        svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/></svg>',
        text,
        textEn: text,
        tags: [tag],
        tagsEn: [tag],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      state.prompts.unshift(newPrompt);
      titleInput.value = "";
      textInput.value = "";
      tagInput.value = "";
      popupAddForm.style.display = "none";

      renderTags();
      renderOverlayList();
      renderPopupSimList();
    });
  }

  // 5-Click Settings Easter Egg Simulation
  if (easterEggBox && easterEggStatus) {
    easterEggBox.addEventListener("click", () => {
      if (state.easterEggRevealed) return;
      state.easterEggClicks += 1;
      const remaining = 5 - state.easterEggClicks;
      if (remaining > 0) {
        easterEggStatus.textContent = `${state.easterEggClicks}/5`;
      } else {
        state.easterEggRevealed = true;
        easterEggStatus.innerHTML = `<span style="color: var(--icon-green-fg); font-weight: 700;">● API Online (176.138.97.78:8443)</span>`;
      }
    });
  }

  // Installation Tabs
  const installTabRelease = document.getElementById("install-tab-release");
  const installTabSource = document.getElementById("install-tab-source");
  const installPanelRelease = document.getElementById("install-panel-release");
  const installPanelSource = document.getElementById("install-panel-source");

  if (installTabRelease && installTabSource) {
    installTabRelease.addEventListener("click", () => {
      installTabRelease.setAttribute("aria-selected", "true");
      installTabSource.setAttribute("aria-selected", "false");
      installPanelRelease.style.display = "grid";
      installPanelSource.style.display = "none";
    });
    installTabSource.addEventListener("click", () => {
      installTabRelease.setAttribute("aria-selected", "false");
      installTabSource.setAttribute("aria-selected", "true");
      installPanelRelease.style.display = "none";
      installPanelSource.style.display = "grid";
    });
  }

  // Copy buttons
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute("data-copy");
      if (!value) return;
      navigator.clipboard?.writeText(value);
      const original = btn.textContent;
      btn.textContent = state.lang === "en" ? "Copied" : "Скопійовано";
      setTimeout(() => {
        btn.textContent = original;
      }, 1400);
    });
  });

  // Initial render
  renderTags();
  renderOverlayList();
  renderPopupSimList();
  // Pre-load the first prompt so the user immediately sees highlighted {{variables}} in action
  insertTemplateIntoGemini(getLocalizedPrompt(INITIAL_PROMPTS[0]).displayText);
  state.popoverOpen = true;
  updatePopoverVisibility();
})();
