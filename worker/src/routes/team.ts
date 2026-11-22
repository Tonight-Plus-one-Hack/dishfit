import { ANON_ID_PATTERN, ANON_ID_STORAGE_KEY } from "@wohin/contract";
import { teamDeviceMessages } from "../../../apps/web/src/i18n/team";
import type { RouteContext } from "../lib/http";

/** Lets a team member exclude the existing browser ID created by the app. */
export function teamPage({ request }: RouteContext): Response {
  const browserLanguage = request.headers.get("accept-language")?.split(/[,;]/, 1)[0]?.trim() || "de";
  const language = /^de(?:-|$)/i.test(browserLanguage) ? "de" : "en";
  const copy = teamDeviceMessages[language];
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html>
<html lang="${language}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${copy.title}</title>
<h1>${copy.heading}</h1>
<p>${copy.instructions}</p>
<form>
  <label>${copy.token} <input type="password" id="token" autocomplete="off" required></label>
  <button disabled>${copy.submit}</button>
</form>
<p role="status"></p>
<script nonce="${nonce}">
const key = ${JSON.stringify(ANON_ID_STORAGE_KEY)};
const validId = new RegExp(${JSON.stringify(ANON_ID_PATTERN.source)});
const form = document.querySelector('form');
const token = document.getElementById('token');
const button = form.querySelector('button');
const status = document.querySelector('[role="status"]');
button.disabled = false;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = '';
  try {
    const anonId = localStorage.getItem(key);
    if (!anonId || !validId.test(anonId)) {
      status.textContent = ${JSON.stringify(copy.needsApp)};
      return;
    }
    const response = await fetch('/api/admin/numbers/exclude', {
      method: 'POST',
      headers: { 'authorization': 'Bearer ' + token.value.trim(), 'content-type': 'application/json' },
      body: JSON.stringify({ anonId }),
    });
    if (!response.ok) throw new Error();
    token.value = '';
    status.textContent = ${JSON.stringify(copy.success)};
  } catch {
    status.textContent = ${JSON.stringify(copy.failure)};
  } finally {
    button.disabled = false;
  }
});
</script>
</html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-language": language,
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
