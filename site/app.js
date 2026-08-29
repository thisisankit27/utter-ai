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

/* live download counter — real data, cache-friendly */
(async function counter() {
  const el = document.getElementById("dl-count");
  const fmt = (n) =>
    n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);

  const countUp = (target) => {
    const dur = 900;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const cacheKey = "utterai-dl";
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.at < 9e5) {
      countUp(cached.n);
      return;
    }
  } catch {
    /* ignore */
  }

  // 1. committed snapshot (rate-limit proof), 2. live GitHub API
  let total = null;
  try {
    const r = await fetch("downloads.json", { cache: "no-cache" });
    if (r.ok) total = (await r.json()).total;
  } catch {
    /* fall through */
  }
  if (total == null) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`);
      if (r.ok) {
        const releases = await r.json();
        total = releases
          .flatMap((rel) => rel.assets || [])
          .filter((a) => !/\.(sig|json)$/.test(a.name))
          .reduce((s, a) => s + (a.download_count || 0), 0);
      }
    } catch {
      /* ignore */
    }
  }

  if (!total) {
    // no releases yet, or counts unavailable — don't show a lonely "0"
    el.textContent = "Free";
    el.nextSibling.textContent = " & open source";
    return;
  }
  countUp(total);
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ n: total, at: Date.now() }));
  } catch {
    /* ignore */
  }
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
