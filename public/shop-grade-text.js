(() => {
  "use strict";

  /*
   * Trizone Shop — texte dynamique des cartes + suppression de la barre verte.
   *
   * Affichage :
   *   Default+  -> DEFAULT+
   *   VIP       -> VIP
   *   VIP+      -> VIP+
   *   Hero      -> HERO
   *   Emperor   -> IMPERATOR
   *
   * La clé technique "emperor" peut rester utilisée côté backend/Render.
   */

  const GRADES = [
    { names: ["imperator", "emperor"], label: "IMPERATOR" },
    { names: ["hero"], label: "HERO" },
    { names: ["vip+"], label: "VIP+" },
    { names: ["vip"], label: "VIP" },
    { names: ["default+"], label: "DEFAULT+" }
  ];

  const normalize = (value) =>
    String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  function gradeFromText(text) {
    const value = normalize(text);

    // Important : VIP+ doit être testé avant VIP.
    for (const grade of GRADES) {
      if (grade.names.some((name) => value.includes(name))) {
        return grade.label;
      }
    }

    return null;
  }

  function findCardGrade(startElement) {
    let current = startElement;

    // On remonte jusqu'à BODY, sans limite artificielle de profondeur.
    while (current && current !== document.body) {
      const label = gradeFromText(current.textContent);

      // L'ancêtre doit contenir le nom d'un grade ET rester de taille raisonnable
      // pour éviter de prendre toute la page.
      if (label && current.querySelectorAll("*").length < 80) {
        return label;
      }

      current = current.parentElement;
    }

    return null;
  }

  function replaceTrizoneLabels() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
      const text = String(node.nodeValue ?? "").trim();

      if (text.toUpperCase() !== "TRIZONE") continue;

      const parent = node.parentElement;
      if (!parent) continue;

      const label = findCardGrade(parent);
      if (!label) continue;

      node.nodeValue = label;
      parent.dataset.gradeBanner = label;
    }
  }

  function renameEmperorToImperator() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
      if (!node.nodeValue) continue;

      node.nodeValue = node.nodeValue
        .replace(/\bEmperor\b/g, "Imperator")
        .replace(/\bEMPEROR\b/g, "IMPERATOR");
    }
  }

  function removeManagedPaymentsBanner() {
    const all = Array.from(document.body.querySelectorAll("*"));

    // On cherche le plus petit élément contenant le texte de la barre verte.
    const candidates = all.filter((element) => {
      const text = normalize(element.textContent);
      return (
        text.includes("achat pour") &&
        text.includes("stripe managed payments") &&
        text.includes("link")
      );
    });

    if (!candidates.length) return;

    candidates.sort((a, b) => {
      const aCount = a.querySelectorAll("*").length;
      const bCount = b.querySelectorAll("*").length;
      return aCount - bCount;
    });

    let target = candidates[0];

    // Si son parent ne contient rien d'autre que le même message,
    // on masque le conteneur complet pour supprimer aussi le fond/bord vert.
    for (let i = 0; i < 3 && target.parentElement; i += 1) {
      const parent = target.parentElement;

      if (
        normalize(parent.textContent) === normalize(target.textContent) &&
        parent.querySelectorAll("*").length <= 12
      ) {
        target = parent;
      } else {
        break;
      }
    }

    target.style.setProperty("display", "none", "important");
    target.setAttribute("aria-hidden", "true");
    target.dataset.trizoneHiddenManagedBanner = "true";
  }

  function refresh() {
    renameEmperorToImperator();
    replaceTrizoneLabels();
    removeManagedPaymentsBanner();
  }

  let scheduled = false;

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  }

  function start() {
    refresh();

    // Les produits Stripe sont chargés dynamiquement.
    const observer = new MutationObserver(scheduleRefresh);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Sécurité supplémentaire pendant le chargement initial.
    const intervals = [250, 600, 1200, 2500, 5000];
    for (const delay of intervals) {
      setTimeout(refresh, delay);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
