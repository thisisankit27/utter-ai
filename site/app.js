// UtterAI landing page — progressive enhancement only.
const REPO = "thisisankit27/utter-ai";

/* nav shadow on scroll */
const nav = document.querySelector("header.nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
onScroll();
addEventListener("scroll", onScroll, { passive: true });

/* mobile menu */
const navToggle = document.getElementById("nav-toggle");
const navLinks = document.getElementById("nav-links");
const setMenu = (open) => {
  navLinks.classList.toggle("open", open);
  navToggle.setAttribute("aria-expanded", String(open));
};
navToggle.addEventListener("click", () =>
  setMenu(navToggle.getAttribute("aria-expanded") !== "true"),
);
navLinks.addEventListener("click", (e) => {
  if (e.target.tagName === "A") setMenu(false);
});

/* scroll reveal */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 },
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* hero ribbon — a calm animated amplitude bed (respects reduced motion) */
(function ribbon() {
  const host = document.getElementById("ribbon");
  if (!host) return;
  const N = Math.min(96, Math.floor(window.innerWidth / 12));
  const bars = [];
  for (let i = 0; i < N; i++) {
    const s = document.createElement("span");
    s.style.height = "6px";
    host.appendChild(s);
    bars.push(s);
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let filled = 0;
  function frame(t) {
    for (let i = 0; i < N; i++) {
      const base =
        8 +
        22 * Math.abs(Math.sin(i * 0.5 + t / 900)) +
        14 * Math.abs(Math.sin(i * 0.17 + t / 1700));
      bars[i].style.height = base.toFixed(1) + "px";
      bars[i].classList.toggle("on", i / N <= filled);
    }
    filled += 0.004;
    if (filled > 1.1) filled = 0;
    if (!reduce) requestAnimationFrame(frame);
  }
  if (reduce) {
    bars.forEach((b, i) => {
      b.style.height = 6 + ((i * 37) % 30) + "px";
      if (i < N * 0.6) b.classList.add("on");
    });
  } else {
    requestAnimationFrame(frame);
  }
})();

/* OS detection for the primary button */
(function detectOS() {
  const p = navigator.userAgent + " " + navigator.platform;
  let os = "linux";
  if (/Win/i.test(p)) os = "windows";
  else if (/Mac/i.test(p)) os = "mac";
  const btn = document.getElementById("primary-dl");
  if (os === "windows") btn.textContent = "Download for Windows";
  else if (os === "mac") btn.textContent = "View downloads";
  else btn.textContent = "Download for Linux";
})();

/* live download counter — real data only, refreshes while the tab is open */
(function counter() {
  const el = document.getElementById("dl-count");
  if (!el) return;
  const label = el.nextSibling; // the " downloads" text node
  const cacheKey = "utterai-dl";
  const IGNORE = /\.(sig|json|txt|sha256|blockmap)$/i;

  const fmt = (n) =>
    n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);

  let shown = 0;
  let raf = 0;
  const animateTo = (target) => {
    cancelAnimationFrame(raf);
    const from = shown;
    const start = performance.now();
    const dur = 900;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      shown = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = fmt(shown);
      if (k < 1) raf = requestAnimationFrame(tick);
      else shown = target;
    };
    raf = requestAnimationFrame(tick);
  };

  const show = (total) => {
    if (typeof total !== "number" || !isFinite(total) || total < 0) return false;
    el.classList.add("is-live");
    if (label) label.textContent = total === 1 ? " download" : " downloads";
    animateTo(total);
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ n: total, at: Date.now() }));
    } catch {
      /* ignore */
    }
    return true;
  };

  // Live GitHub API first (always current); committed snapshot as the
  // rate-limit fallback. Never fabricates — falls back to a plain label only
  // when neither source yields a number.
  const fromApi = async () => {
    const r = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=100`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!r.ok) throw new Error(String(r.status));
    const releases = await r.json();
    return releases
      .flatMap((rel) => rel.assets || [])
      .filter((a) => !IGNORE.test(a.name))
      .reduce((s, a) => s + (a.download_count || 0), 0);
  };
  const fromSnapshot = async () => {
    const r = await fetch("downloads.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    const n = (await r.json()).total;
    if (typeof n !== "number") throw new Error("no total");
    return n;
  };

  const refresh = async () => {
    let total;
    try {
      total = await fromApi();
    } catch {
      try {
        total = await fromSnapshot();
      } catch {
        return false;
      }
    }
    return show(total);
  };

  // Paint the cached value immediately so there's no flash of "—".
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (c && typeof c.n === "number") show(c.n);
  } catch {
    /* ignore */
  }

  refresh().then((ok) => {
    if (ok || shown > 0) return;
    // Genuinely no data available — say something honest instead of "0".
    el.textContent = "Free";
    if (label) label.textContent = " & open source";
  });

  // Keep it live: re-check every 90s while the page is visible.
  setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, 90_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
})();

/* fill in real asset links + sizes from the latest release */
(async function assets() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!r.ok) return;
    const rel = await r.json();
    const byExt = {};
    for (const a of rel.assets || []) {
      const m = a.name.match(/\.(exe|msi|AppImage|deb)$/);
      if (m) byExt[m[1]] = a;
    }
    document.querySelectorAll(".dl-card .opts a[data-ext]").forEach((a) => {
      const asset = byExt[a.dataset.ext];
      if (asset) {
        a.href = asset.browser_download_url;
        const mb = (asset.size / 1048576).toFixed(0);
        a.querySelector("span").textContent = mb + " MB";
      }
    });
  } catch {
    /* links stay pointed at the releases page */
  }
})();
