(() => {
  "use strict";

  // Texte affiché dans la zone violette de chaque carte.
  // La clé technique "Emperor" reste compatible, mais le nom affiché devient "Imperator".
  const GRADE_LABELS = [
    { match: ["imperator", "emperor"], label: "IMPERATOR" },
    { match: ["hero"], label: "HERO" },
    { match: ["vip+"], label: "VIP+" },
    { match: ["vip"], label: "VIP" },
    { match: ["default+"], label: "DEFAULT+" },
  ];

  function normalize(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getGradeLabelFromText(text) {
    const normalized = normalize(text);

    for (const grade of GRADE_LABELS) {
      if (grade.match.some((name) => normalized.includes(name))) {
        return grade.label;
      }
    }

    return null;
  }

  function findGradeLabelForElement(element) {
    // On remonte dans les parents de la carte afin de trouver le nom du grade.
    let current = element;

    for (let depth = 0; current && depth < 8; depth += 1) {
      const label = getGradeLabelFromText(current.textContent);
      if (label) return label;
      current = current.parentElement;
    }

    return null;
  }

  function renameEmperorToImperator(root = document) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
      if (!node.nodeValue) continue;

      // Ne change que le texte visible, jamais les IDs techniques du backend.
      node.nodeValue = node.nodeValue
        .replace(/\bEmperor\b/g, "Imperator")
        .replace(/\bEMPEROR\b/g, "IMPERATOR");
    }
  }

  function updateTrizoneLabels(root = document) {
    const elements = root.querySelectorAll
      ? root.querySelectorAll("*")
      : [];

    for (const element of elements) {
      if (element.children.length !== 0) continue;

      const text = String(element.textContent || "").trim();

      if (text !== "TRIZONE") continue;

      const label = findGradeLabelForElement(element);
      if (!label) continue;

      element.textContent = label;

      // Permet de repérer facilement les éléments modifiés dans l'inspecteur.
      element.dataset.trizoneGradeLabel = label.toLowerCase();
    }
  }

  function refresh(root = document) {
    renameEmperorToImperator(root);
    updateTrizoneLabels(root);
  }

  function start() {
    refresh(document);

    // Les produits Stripe arrivent de façon dynamique :
    // on surveille donc les nouvelles cartes ajoutées à la page.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          refresh(node);
        }
      }

      // Sécurité pour les modifications de texte d'une carte déjà présente.
      updateTrizoneLabels(document);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
