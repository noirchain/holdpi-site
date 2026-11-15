/* Read-only documentation controls. No wallet connection or transaction path. */
(() => {
  const $ = (id) => document.getElementById(id);
  const range = $("doc-day");
  const redraw = () => {
    const day = Number(range.value);
    $("doc-day-label").textContent = day + " DAYS";
    $("doc-rate").textContent =
      (PIEconomics.sellBps(day) / 100).toFixed(2) + "%";
    $("doc-weight").textContent = PIEconomics.weight(day) + "×";
  };
  range.addEventListener("input", redraw);
  redraw();
  const get = async (path) => {
    const r = await fetch(path);
    if (!r.ok) throw new Error("Unavailable: " + path);
    return r;
  };
  (async () => {
    try {
      const report = await (
        await get("/review/contract-verification.json")
      ).json();
      const passed = report.tests.filter((t) => t.status === "passed").length;
      $("test-count").textContent =
        `${passed} / ${report.tests.length} CONTRACT TESTS PASSED · LOCAL BNB FORK`;
      const labels = {
        migration: "Graduation",
        dexBuy: "DEX buy",
        dexFreshSell: "Fresh DEX sell",
        conversion: "PI tax conversion",
        buyback: "Buyback and burn",
        addLiquidity: "Locked liquidity addition",
        crowdedTransfer: "Crowded cohort transfer",
        crowdedDistribution: "Crowded cohort distribution",
      };
      $("gas-results").replaceChildren(
        ...Object.entries(report.gasUnits).map(([key, value]) => {
          const tr = document.createElement("tr");
          const name = document.createElement("td"),
            gas = document.createElement("td");
          name.textContent = labels[key] || key;
          gas.textContent = Number(value).toLocaleString("en-US");
          tr.append(name, gas);
          return tr;
        }),
      );
      $("test-results").replaceChildren(
        ...report.tests.map((t) => {
          const li = document.createElement("li");
          li.textContent = `[${t.status.toUpperCase()}] ${t.title}`;
          return li;
        }),
      );
    } catch (e) {
      $("test-count").textContent = "REPORT UNAVAILABLE";
      $("gas-results").textContent =
        "Reload to retrieve the verification report.";
    }
  })();
  (async () => {
    try {
      const manifest = await (await get("/review/manifest.json")).json();
      const files = manifest.files.filter((f) => f.viewer);
      const select = $("source-file");
      select.replaceChildren(
        ...files.map((f) => {
          const option = document.createElement("option");
          option.value = f.url;
          option.textContent = f.path;
          return option;
        }),
      );
      let request = 0;
      const load = async () => {
        const sequence = ++request;
        const path = select.value;
        if (!files.some((f) => f.url === path)) return;
        try {
          const text = await (await get(path)).text();
          if (sequence !== request) return;
          $("source-code").textContent = text;
          $("source-download").href = path;
        } catch (e) {
          $("source-code").textContent =
            "Source unavailable. Download the review package to inspect this file.";
        }
      };
      select.addEventListener("change", load);
      await load();
    } catch (e) {
      $("source-code").textContent =
        "Source manifest unavailable. The full review archive is linked above.";
    }
  })();
  const sections = [...document.querySelectorAll(".doc-section")],
    links = [...document.querySelectorAll(".doc-index a")];
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting)
            for (const link of links)
              link.classList.toggle(
                "is-active",
                link.hash === "#" + e.target.id,
              );
      },
      { rootMargin: "-120px 0px -65% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
  }
})();
