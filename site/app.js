// UtterAI landing page — progressive enhancement only.
const REPO = "thisisankit27/utter-ai";

/* One shared release fetch. The counter and the asset sizes both need the same
   data, and the API is rate-limited to 60 requests an hour per IP for anonymous
   callers — asking twice per page load, plus a poll, used to burn through that
   quickly enough that a few open tabs would start getting 403s. */
let releasesPromise;
function allReleases() {
  releasesPromise ??= fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=100`,
    { headers: { Accept: "application/vnd.github+json" } },
  )
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .catch(() => null);
  return releasesPromise;
}
async function latestRelease() {
  const all = await allReleases();
  return all?.find((r) => !r.draft && !r.prerelease) ?? all?.[0] ?? null;
}
/** Drop the cache so a refresh actually re-asks. */
function invalidateReleases() {
  releasesPromise = undefined;
}

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

/* OS detection for the primary button. The label used to promise a download
   while the link only scrolled to a section; now it goes to the download page,
   which starts the right file and explains the install. */
(function detectOS() {
  const p = navigator.userAgent + " " + (navigator.platform || "");
  const btn = document.getElementById("primary-dl");
  if (!btn) return;
  if (/Win/i.test(p)) {
    btn.textContent = "Download for Windows";
    btn.href = "download.html?p=windows";
  } else if (/Mac/i.test(p)) {
    // No Mac build yet — don't offer one.
    btn.textContent = "View downloads";
    btn.href = "#download";
  } else if (/Ubuntu|Debian/i.test(p)) {
    btn.textContent = "Download for Ubuntu";
    btn.href = "download.html?p=deb";
  } else {
    btn.textContent = "Download for Linux";
    btn.href = "download.html?p=appimage";
  }
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
    const releases = await allReleases();
    if (!releases) throw new Error("unavailable");
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

  // Keep it reasonably live without eating the anonymous rate limit. A
  // download counter does not need to be accurate to the minute.
  const RECHECK_MS = 600_000;
  let lastCheck = Date.now();
  const maybeRefresh = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck < RECHECK_MS) return;
    lastCheck = Date.now();
    invalidateReleases();
    refresh();
  };
  setInterval(maybeRefresh, 60_000);
  document.addEventListener("visibilitychange", maybeRefresh);
})();

/* Fill in real sizes from the latest release. The hrefs deliberately stay
   pointed at download.html, which starts the download *and* shows the checksum
   and install steps — a bare asset link drops people onto a saved file with no
   idea what to do next. */
(async function assets() {
  const rel = await latestRelease();
  if (!rel) return;
  const byExt = {};
  for (const a of rel.assets || []) {
    const m = a.name.match(/\.(exe|msi|AppImage|deb)$/);
    if (m) byExt[m[1]] = a;
  }
  document.querySelectorAll(".dl-card .opts a[data-ext]").forEach((a) => {
    const asset = byExt[a.dataset.ext];
    const span = a.querySelector("span");
    if (asset && span) span.textContent = (asset.size / 1048576).toFixed(0) + " MB";
  });
})();
