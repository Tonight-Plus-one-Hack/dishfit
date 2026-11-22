/**
 * GET /api/admin/queue: a plain team queue for community submissions the agent did not decide.
 * The page asks for the ADMIN_TOKEN and keeps it in memory until navigation.
 */
const PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Community-Queue</title>
<style>
:root { --bg: #fcfcfd; --card: #f9f9fb; --ink: #1c2024; --muted: #60646c; --rule: #e8e8ec; --ok: #1f7a4d; --bad: #b42318; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #111113; --card: #18191b; --ink: #edeef0; --muted: #afb3ba; --rule: #2a2c30; --ok: #4cc38a; --bad: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 Geist, ui-sans-serif, system-ui, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; letter-spacing: -0.03em; margin: 0 0 4px; }
.muted { color: var(--muted); }
.item { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr); gap: 16px; background: var(--card); border: 1px solid var(--rule); border-radius: 10px; padding: 14px; margin: 14px 0; }
@media (max-width: 640px) { .item { grid-template-columns: minmax(0, 1fr); } }
.item img { width: 100%; border-radius: 8px; background: var(--rule); min-height: 120px; object-fit: cover; }
.item h2 { font-size: 17px; margin: 0; }
ul { margin: 6px 0; padding-left: 18px; }
.note { font-size: 13px; color: var(--muted); }
button { font: inherit; border-radius: 6px; border: 1px solid var(--rule); background: var(--bg); color: var(--ink); padding: 6px 12px; cursor: pointer; }
button.ok { background: var(--ok); color: #fff; border-color: var(--ok); }
button.bad { color: var(--bad); }
input { font: inherit; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--bg); color: var(--ink); width: min(100%, 360px); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
</style>
</head>
<body>
<main>
<h1>Community-Queue</h1>
<p class="muted">Speisekarten-Fotos, die der Review-Agent nicht allein entschieden hat. Fotos bleiben privat.</p>
<form id="login"><input id="token" type="password" placeholder="Admin-Token" autocomplete="off"> <button>Laden</button></form>
<div id="list"></div>
</main>
<script type="module" nonce="__SCRIPT_NONCE__">
const list = document.getElementById("list");
const tokenInput = document.getElementById("token");
// Remove credentials left by earlier versions, including in tabs returning to the queue.
try { sessionStorage.removeItem("wohin-admin-token"); } catch {}
let token = "";
const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); Object.assign(el, attrs); el.append(...kids); return el; };
const euro = (c) => c == null ? "Preis vor Ort" : (c / 100).toFixed(2).replace(".", ",") + " €";
async function call(path, init = {}) {
  const res = await fetch(path, { ...init, redirect: "error", headers: { ...(init.headers || {}), authorization: "Bearer " + token } });
  if (!res.ok) throw new Error(res.status);
  return res;
}
async function load() {
  list.replaceChildren(h("p", { className: "muted", textContent: "Lädt..." }));
  try {
    const { items } = await (await call("/api/admin/submissions?status=review")).json();
    if (!items.length) return list.replaceChildren(h("p", { className: "muted", textContent: "Nichts zu prüfen." }));
    list.replaceChildren(...items.map(item));
  } catch (e) {
    list.replaceChildren(h("p", { className: "muted", textContent: "Token falsch oder Fehler (" + e.message + ")." }));
  }
}
function item(s) {
  const img = h("img", { alt: "Speisekarten-Foto" });
  call("/api/admin/submissions/" + s.id + "/photo").then((r) => r.blob()).then((b) => { img.src = URL.createObjectURL(b); }).catch(() => {});
  const place = s.newPlace ? " (neu: " + (s.newPlace.address || s.newPlace.lat.toFixed(5) + ", " + s.newPlace.lng.toFixed(5)) + ")" : "";
  const reason = h("input", { placeholder: "Grund für Ablehnung (sieht der Gast)" });
  const decide = async (decision) => {
    await call("/api/admin/submissions/" + s.id + "/decision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, reason: reason.value }) });
    load();
  };
  return h("div", { className: "item" }, img, h("div", {},
    h("h2", { textContent: s.restaurant.name + place }),
    h("p", { className: "note", textContent: (s.teamNote || "-") + " · " + new Date(s.createdAt).toLocaleString("de-DE") + " · " + s.costUsd.toFixed(4) + " USD" }),
    h("ul", {}, ...s.dishes.map((d) => h("li", { textContent: d.name + " · " + euro(d.priceCents) + " · " + Math.round(d.kcal) + " kcal · " + d.proteinG + " g Protein" + (d.flags.length ? " · " + d.flags.join(", ") : "") }))),
    h("div", { className: "actions" },
      h("button", { className: "ok", textContent: "Veröffentlichen", disabled: !s.dishes.length, onclick: () => decide("publish") }),
      reason,
      h("button", { className: "bad", textContent: "Ablehnen", onclick: () => decide("reject") }))));
}
document.getElementById("login").addEventListener("submit", (e) => {
  e.preventDefault();
  token = tokenInput.value.trim();
  tokenInput.value = "";
  load();
});
window.addEventListener("pagehide", () => { token = ""; });
</script>
</body>
</html>`;

export function queuePage(): Response {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  return new Response(PAGE.replace("__SCRIPT_NONCE__", nonce), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "content-security-policy": `default-src 'none'; connect-src 'self'; img-src blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    },
  });
}
