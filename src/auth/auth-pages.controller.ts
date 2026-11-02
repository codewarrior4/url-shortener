import { Controller, Get, Header } from '@nestjs/common';

function page(purpose: 'verify' | 'reset') {
  const title =
    purpose === 'verify' ? 'Verify your email' : 'Reset your password';
  const endpoint =
    purpose === 'verify' ? '/auth/verify-email' : '/auth/reset-password';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body><main><h1>${title}</h1><form id="form">${purpose === 'reset' ? '<label>New password (12–128 characters) <input id="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>' : ''}<button type="submit">${title}</button></form><p id="status" role="status"></p></main>
<script>
const token = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);
const form = document.getElementById('form');
const status = document.getElementById('status');
if (!token) { form.hidden = true; status.textContent = 'Missing token. Request a new email.'; }
form.addEventListener('submit', async event => {
 event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
 try {
  const body = {token}; ${purpose === 'reset' ? "body.password = document.getElementById('password').value;" : ''}
  const response = await fetch('${endpoint}', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const result = await response.json();
  status.textContent = response.ok ? result.message : 'Link invalid or expired, or request rejected. Request a new email and try again.';
  if (response.ok) form.hidden = true;
 } catch { status.textContent = 'Connection failed. Please try again.'; }
 finally { button.disabled = false; }
});
</script></body></html>`;
}
@Controller()
export class AuthPagesController {
  @Get('verify-email')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  verify() {
    return page('verify');
  }
  @Get('reset-password')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  reset() {
    return page('reset');
  }
}
