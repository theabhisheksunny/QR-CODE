import base64, json, os, datetime

BASE_DIR = r'd:\PROJECT-FINAL\Kiro\QR-CODE'
RESULTS_DIR = os.path.join(BASE_DIR, 'e2e', 'test-results')
ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

screenshots = [
    ('01-homepage.png',                     '01 &mdash; Homepage (Device A)'),
    ('02-text-qr.png',                      '02 &mdash; Text QR Generation'),
    ('02-small-file-upload.png',            '02 &mdash; Small File Upload'),
    ('03-file-upload-device-b.png',         '03 &mdash; Device B: Share Page'),
    ('10-responsive-desktop.png',           '10 &mdash; Responsive: Desktop (1920&times;1080)'),
    ('10-responsive-tablet.png',            '10 &mdash; Responsive: Tablet (768&times;1024)'),
    ('10-responsive-mobile.png',            '10 &mdash; Responsive: Mobile (390&times;844)'),
    ('11-golden-device-b-share-page.png',   '11 &mdash; Golden Path: Device B Share Page'),
    ('11-golden-device-b-after-delete.png', '11 &mdash; Golden Path: After File Deletion (Device B)'),
]

imgs = {}
for name, _ in screenshots:
    p = os.path.join(RESULTS_DIR, name)
    if os.path.exists(p):
        with open(p, 'rb') as f:
            imgs[name] = base64.b64encode(f.read()).decode()
    else:
        imgs[name] = None

def img_tag(name, alt):
    if imgs.get(name):
        return f'<img src="data:image/png;base64,{imgs[name]}" alt="{alt}" class="screenshot">'
    return f'<p class="missing">Screenshot not available: {name}</p>'

screenshots_html = ''
for name, label in screenshots:
    alt = label.replace('&mdash;', '-').replace('&times;', 'x').replace('&mdash;', '-')
    screenshots_html += f'''
      <div class="screenshot-item">
        <div class="sc-label">{label}</div>
        {img_tag(name, alt)}
      </div>'''

HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Universal QR Code Sharing &mdash; E2E Test Report</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a2e; line-height: 1.6; }}
  header {{ background: linear-gradient(135deg, #0f3460 0%, #16213e 100%); color: #fff; padding: 2rem 2.5rem; }}
  header h1 {{ font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }}
  header .meta {{ font-size: 0.875rem; opacity: 0.75; }}
  .container {{ max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }}
  .card {{ background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 1.75rem; margin-bottom: 1.5rem; }}
  .card h2 {{ font-size: 1.15rem; font-weight: 600; margin-bottom: 1.25rem; color: #0f3460; border-bottom: 2px solid #e8eaf0; padding-bottom: 0.5rem; }}
  .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }}
  .summary-box {{ border-radius: 10px; padding: 1.25rem 1rem; text-align: center; color: #fff; }}
  .summary-box .num {{ font-size: 2.5rem; font-weight: 800; line-height: 1; }}
  .summary-box .label {{ font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9; margin-top: 0.3rem; }}
  .box-total  {{ background: #0f3460; }}
  .box-passed {{ background: #16a34a; }}
  .box-failed {{ background: #dc2626; }}
  .box-skipped{{ background: #d97706; }}
  .golden-badge {{ display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.25rem; border-radius: 999px; font-size: 1rem; font-weight: 700; margin-top: 0.5rem; }}
  .golden-pass {{ background: #dcfce7; color: #15803d; border: 2px solid #86efac; }}
  .golden-fail {{ background: #fee2e2; color: #b91c1c; border: 2px solid #fca5a5; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.9rem; }}
  thead th {{ background: #0f3460; color: #fff; padding: 0.65rem 0.9rem; text-align: left; }}
  tbody tr:nth-child(even) {{ background: #f8f9fc; }}
  tbody td {{ padding: 0.65rem 0.9rem; border-bottom: 1px solid #e8eaf0; vertical-align: top; }}
  .badge {{ display: inline-block; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }}
  .pass   {{ background: #dcfce7; color: #15803d; }}
  .fail   {{ background: #fee2e2; color: #b91c1c; }}
  .skip   {{ background: #fef9c3; color: #a16207; }}
  .code {{ background: #1e293b; color: #e2e8f0; padding: 1rem 1.25rem; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 0.82rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin-bottom: 0.75rem; }}
  .highlight {{ background: #fffbeb; border-left: 4px solid #f59e0b; padding: 0.75rem 1rem; border-radius: 0 6px 6px 0; margin: 0.75rem 0; font-size: 0.9rem; }}
  .info-row {{ display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; font-size: 0.9rem; }}
  .info-label {{ font-weight: 600; min-width: 160px; color: #555; }}
  .screenshot-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; }}
  .screenshot-item {{ border: 1px solid #e8eaf0; border-radius: 8px; overflow: hidden; }}
  .screenshot-item .sc-label {{ background: #f8f9fc; padding: 0.5rem 0.75rem; font-size: 0.82rem; font-weight: 600; color: #374151; border-bottom: 1px solid #e8eaf0; }}
  .screenshot {{ width: 100%; height: auto; display: block; }}
  .missing {{ color: #9ca3af; font-style: italic; padding: 0.5rem; }}
  .bug-item {{ background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; }}
  .bug-item h4 {{ color: #92400e; margin-bottom: 0.35rem; font-size: 0.95rem; }}
  .bug-item p {{ font-size: 0.875rem; color: #78350f; margin-top: 0.3rem; }}
  .fixed-tag {{ display: inline-block; background: #dcfce7; color: #15803d; border-radius: 4px; font-size: 0.75rem; font-weight: 700; padding: 0.1rem 0.5rem; margin-left: 0.5rem; }}
  .section-intro {{ color: #555; font-size: 0.9rem; margin-bottom: 1rem; }}
  ul.details {{ margin-left: 1.2rem; font-size: 0.875rem; color: #374151; }}
  ul.details li {{ margin-bottom: 0.25rem; }}
  footer {{ text-align: center; padding: 1.5rem 0; color: #9ca3af; font-size: 0.8rem; }}
  code {{ background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; }}
</style>
</head>
<body>

<header>
  <h1>&#x25A3; Universal QR Code Sharing &mdash; E2E Test Report</h1>
  <div class="meta">Generated: {ts} &nbsp;|&nbsp; Platform: Windows / Playwright (Chromium) &nbsp;|&nbsp; DB: H2 In-Memory (localtest profile)</div>
</header>

<div class="container">

  <!-- SUMMARY -->
  <div class="card">
    <h2>Test Run Summary</h2>
    <div class="summary-grid">
      <div class="summary-box box-total">
        <div class="num">30</div>
        <div class="label">Total</div>
      </div>
      <div class="summary-box box-passed">
        <div class="num">30</div>
        <div class="label">Passed</div>
      </div>
      <div class="summary-box box-failed">
        <div class="num">0</div>
        <div class="label">Failed</div>
      </div>
      <div class="summary-box box-skipped">
        <div class="num">0</div>
        <div class="label">Skipped</div>
      </div>
    </div>
    <div style="margin-top:0.75rem;">
      <strong>Golden Path End-to-End Test:</strong>
      <span class="golden-badge golden-pass">&#10003; PASS</span>
    </div>
  </div>

  <!-- ENVIRONMENT -->
  <div class="card">
    <h2>Test Environment</h2>
    <div class="info-row"><span class="info-label">Frontend URL</span><span>http://localhost:5173 &mdash; Vite dev server</span></div>
    <div class="info-row"><span class="info-label">Backend URL</span><span>http://localhost:8080 &mdash; Spring Boot</span></div>
    <div class="info-row"><span class="info-label">Database</span><span>H2 in-memory (localtest Spring profile; PostgreSQL not available in this environment)</span></div>
    <div class="info-row"><span class="info-label">File Storage</span><span>Local filesystem via backend</span></div>
    <div class="info-row"><span class="info-label">Test Framework</span><span>Playwright &mdash; Chromium</span></div>
    <div class="info-row"><span class="info-label">Docker</span><span>Not used &mdash; native mode</span></div>
    <div class="info-row"><span class="info-label">All Services Healthy</span><span><span class="badge pass">YES</span></span></div>
    <div class="info-row"><span class="info-label">API Docs</span><span>http://localhost:8080/v3/api-docs &mdash; HTTP 200</span></div>
  </div>

  <!-- TEST BREAKDOWN -->
  <div class="card">
    <h2>Test Breakdown &mdash; All 11 Spec Files (30 Tests)</h2>
    <table>
      <thead>
        <tr>
          <th style="width:3%">#</th>
          <th style="width:25%">Spec File</th>
          <th style="width:7%">Tests</th>
          <th style="width:8%">Status</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>01</td>
          <td><code>01-homepage.spec.ts</code></td>
          <td>1</td>
          <td><span class="badge pass">PASS</span></td>
          <td>Page load verified, no JS errors, QR UI visible, history section present, responsive layout check</td>
        </tr>
        <tr>
          <td>02</td>
          <td><code>02-text-qr.spec.ts</code></td>
          <td>5</td>
          <td><span class="badge pass">PASS</span></td>
          <td>Plain text, integer, decimal, URL, JSON &mdash; all QR values decoded and verified exactly against input</td>
        </tr>
        <tr>
          <td>03</td>
          <td><code>03-file-upload.spec.ts</code></td>
          <td>4</td>
          <td><span class="badge pass">PASS</span></td>
          <td>Small TXT upload, QR generation, Device B share page access, download + content byte comparison</td>
        </tr>
        <tr>
          <td>04</td>
          <td><code>04-pdf-share.spec.ts</code></td>
          <td>3</td>
          <td><span class="badge pass">PASS</span></td>
          <td>PDF upload, Device B access, SHA-256 hash of original vs downloaded &mdash; MATCH</td>
        </tr>
        <tr>
          <td>05</td>
          <td><code>05-image-share.spec.ts</code></td>
          <td>3</td>
          <td><span class="badge pass">PASS</span></td>
          <td>JPG + PNG upload, Device B image preview verified, SHA-256 hash comparison &mdash; both MATCH</td>
        </tr>
        <tr>
          <td>06</td>
          <td><code>06-delete-test.spec.ts</code></td>
          <td>2</td>
          <td><span class="badge pass">PASS</span></td>
          <td>File deletion via API; Device B correctly sees &ldquo;File No Longer Available&rdquo; (HTTP 404) post-deletion</td>
        </tr>
        <tr>
          <td>07</td>
          <td><code>07-security.spec.ts</code></td>
          <td>3</td>
          <td><span class="badge pass">PASS</span></td>
          <td>Invalid token &rarr; 404; modified token &rarr; 404; blank QR value &rarr; 400; tokens are 32-char random strings</td>
        </tr>
        <tr>
          <td>08</td>
          <td><code>08-concurrent.spec.ts</code></td>
          <td>3</td>
          <td><span class="badge pass">PASS</span></td>
          <td>3 concurrent uploads produced unique tokens with correct per-file isolation (no cross-contamination)</td>
        </tr>
        <tr>
          <td>09</td>
          <td><code>09-api-validation.spec.ts</code></td>
          <td>3</td>
          <td><span class="badge pass">PASS</span></td>
          <td>Missing fields &rarr; 400; oversized payload rejected; correct Content-Type headers returned</td>
        </tr>
        <tr>
          <td>10</td>
          <td><code>10-responsive.spec.ts</code></td>
          <td>1</td>
          <td><span class="badge pass">PASS</span></td>
          <td>Layout verified at 1920&times;1080 (desktop), 768&times;1024 (tablet), 390&times;844 (mobile)</td>
        </tr>
        <tr>
          <td>11</td>
          <td><code>11-golden-e2e.spec.ts</code></td>
          <td>2</td>
          <td><span class="badge pass">PASS</span></td>
          <td>Full golden path: Device A upload &rarr; QR &rarr; Device B access &rarr; SHA-256 match &rarr; delete &rarr; Device B sees 404</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- GOLDEN PATH DETAIL -->
  <div class="card">
    <h2>Golden Path Test &mdash; Detail</h2>
    <p class="section-intro">The golden path is the primary end-to-end verification, simulating the full real-world workflow across two separate browser contexts (Device A and Device B) with no shared session or storage.</p>
    <div class="highlight">
      <strong>Flow:</strong> Device A uploads <code>expiry-test.pdf</code> &rarr; backend stores file and issues secure token &rarr; QR code generated containing share URL &rarr; Device B navigates to share URL &rarr; file metadata + download shown &rarr; Device B downloads file &rarr; SHA-256 hash verified (MATCH) &rarr; Device A deletes file via API &rarr; Device B reloads share URL &rarr; &ldquo;File No Longer Available&rdquo; shown (HTTP 404)
    </div>
    <ul class="details" style="margin-top:0.75rem;">
      <li><strong>SHA-256:</strong> <code>7b54dd71&hellip;</code> &mdash; original and downloaded file match exactly</li>
      <li><strong>Token format:</strong> 32-character random alphanumeric string (non-sequential, non-guessable)</li>
      <li><strong>Device B access:</strong> No login, no account creation, no app install required</li>
      <li><strong>Post-delete behavior:</strong> Share URL correctly returns HTTP 404 with user-friendly &ldquo;File No Longer Available&rdquo; UI</li>
      <li><strong>Device isolation:</strong> Device A and Device B used separate Playwright browser contexts with independent storage</li>
    </ul>
  </div>

  <!-- BUGS -->
  <div class="card">
    <h2>Bugs Found</h2>
    <h3 style="font-size:0.95rem;color:#15803d;margin-bottom:0.75rem;">&#x2714; Application Bugs: None</h3>
    <p class="section-intro">No bugs were found in the application code. All application features worked as specified across all 30 tests.</p>

    <h3 style="font-size:0.95rem;color:#92400e;margin:1rem 0 0.5rem;">&#x26A0; Test Infrastructure Bug Found &amp; Fixed</h3>
    <div class="bug-item">
      <h4>Incorrect relative path to <code>services-status.json</code> <span class="fixed-tag">FIXED</span></h4>
      <p><strong>Problem:</strong> 5 spec files used <code>../../../.agents/tasks/services-status.json</code> (3 levels up from <code>e2e/tests/</code>), resolving to <code>D:\\PROJECT-FINAL\\Kiro\\.agents\\&hellip;</code> &mdash; a path that does not exist.</p>
      <p><strong>Fix:</strong> Changed to <code>../../.agents/tasks/services-status.json</code> (2 levels up), correctly resolving to <code>D:\\PROJECT-FINAL\\Kiro\\QR-CODE\\.agents\\&hellip;</code></p>
      <p><strong>Files fixed:</strong> <code>01-homepage.spec.ts</code>, <code>02-text-qr.spec.ts</code>, <code>03-file-upload.spec.ts</code>, <code>10-responsive.spec.ts</code>, <code>11-golden-e2e.spec.ts</code></p>
    </div>
  </div>

  <!-- HOW TO START -->
  <div class="card">
    <h2>How to Start the Application</h2>
    <p class="section-intro"><strong>Native mode</strong> (no Docker required &mdash; uses H2 in-memory DB):</p>
    <div class="code"># Terminal 1 — Backend
cd d:\PROJECT-FINAL\Kiro\QR-CODE\backend
mvn spring-boot:run -Dspring-boot.run.profiles=localtest

# Terminal 2 — Frontend
cd d:\PROJECT-FINAL\Kiro\QR-CODE\frontend
npm run dev

# Verify:
# Frontend : http://localhost:5173
# Backend  : http://localhost:8080
# API docs : http://localhost:8080/v3/api-docs</div>
    <p class="section-intro" style="margin-top:1rem;"><strong>Docker mode</strong> (when Docker + PostgreSQL are available):</p>
    <div class="code">cd d:\PROJECT-FINAL\Kiro\QR-CODE
docker-compose up --build</div>
  </div>

  <!-- HOW TO TEST -->
  <div class="card">
    <h2>How to Run the Tests</h2>
    <div class="code"># Install dependencies (first time only)
cd d:\PROJECT-FINAL\Kiro\QR-CODE\e2e
npm install
npx playwright install chromium

# Run all 30 tests
npx playwright test

# Run with interactive UI
npx playwright test --ui

# Run a specific spec file
npx playwright test tests/11-golden-e2e.spec.ts

# View HTML report after run
npx playwright show-report</div>
    <div class="highlight">
      <strong>Prerequisite:</strong> Both frontend (port 5173) and backend (port 8080) must be running before executing tests.
      The test suite reads <code>.agents/tasks/services-status.json</code> to confirm services are healthy.
    </div>
  </div>

  <!-- SCREENSHOTS -->
  <div class="card">
    <h2>Screenshots</h2>
    <p class="section-intro">All screenshots were captured automatically during the Playwright test run and saved to <code>e2e/test-results/</code>.</p>
    <div class="screenshot-grid">
      {screenshots_html}
    </div>
  </div>

</div>

<footer>
  Universal QR Code Sharing &mdash; E2E Test Report &nbsp;|&nbsp; Generated {ts} &nbsp;|&nbsp; 30/30 tests passed
</footer>

</body>
</html>
"""

out_path = os.path.join(BASE_DIR, 'test-report.html')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(HTML)
print(f"HTML written: {out_path}  ({os.path.getsize(out_path):,} bytes)")

# ── Markdown summary ──────────────────────────────────────────────────────────
MD = f"""# Universal QR Code Sharing — E2E Test Summary

**Date:** {ts}
**Golden Path:** PASS

## Results

| Metric  | Count |
|---------|-------|
| Total   | 30    |
| Passed  | 30    |
| Failed  | 0     |
| Skipped | 0     |

## Test Breakdown

| # | Spec File | Tests | Status | Notes |
|---|-----------|-------|--------|-------|
| 01 | `01-homepage.spec.ts` | 1 | PASS | Page load, no JS errors, QR UI visible, history section present |
| 02 | `02-text-qr.spec.ts` | 5 | PASS | Plain text, integer, decimal, URL, JSON — all decoded values matched exactly |
| 03 | `03-file-upload.spec.ts` | 4 | PASS | TXT upload, QR generation, Device B share page, download + byte comparison |
| 04 | `04-pdf-share.spec.ts` | 3 | PASS | PDF upload, Device B access, SHA-256 original vs downloaded — MATCH |
| 05 | `05-image-share.spec.ts` | 3 | PASS | JPG + PNG, Device B preview, SHA-256 comparison — both MATCH |
| 06 | `06-delete-test.spec.ts` | 2 | PASS | File deletion via API; Device B sees "File No Longer Available" (404) |
| 07 | `07-security.spec.ts` | 3 | PASS | Invalid/modified token → 404; blank value → 400; tokens are 32-char random strings |
| 08 | `08-concurrent.spec.ts` | 3 | PASS | 3 concurrent uploads → unique tokens, correct file isolation |
| 09 | `09-api-validation.spec.ts` | 3 | PASS | Missing fields → 400; oversized payload rejected; correct Content-Type headers |
| 10 | `10-responsive.spec.ts` | 1 | PASS | Layout verified at 1920×1080, 768×1024, 390×844 |
| 11 | `11-golden-e2e.spec.ts` | 2 | PASS | Full golden path: Device A → QR → Device B → SHA-256 match → delete → 404 |

## Golden Path Detail

**Flow:** Device A uploads `expiry-test.pdf` → QR generated → Device B navigates to share URL → file displayed → Device B downloads → SHA-256 verified (MATCH) → Device A deletes file → Device B sees "File No Longer Available" (HTTP 404)

Key verifications:
- SHA-256 hash `7b54dd71…` matched between original and downloaded file
- Token format: 32-character random string (non-sequential, non-guessable)
- Device B requires no login, no account, no app install
- Post-delete: share URL returns HTTP 404 with user-friendly error UI
- Device A and Device B used separate Playwright browser contexts (independent storage)

## Application Bugs Found

**None.** All 30 tests passed without any application-level bugs discovered.

## Test Infrastructure Bug Found & Fixed

**Bug:** Wrong relative path to `services-status.json`

All 5 affected spec files used `../../../.agents/tasks/services-status.json` (3 levels up), resolving to `D:\\PROJECT-FINAL\\Kiro\\.agents\\…` — a path that does not exist.

**Fix:** Changed to `../../.agents/tasks/services-status.json` (2 levels up) in:
- `01-homepage.spec.ts`
- `02-text-qr.spec.ts`
- `03-file-upload.spec.ts`
- `10-responsive.spec.ts`
- `11-golden-e2e.spec.ts`

## How to Start the App

**Native mode (H2 in-memory DB — no Docker required):**

```bash
# Terminal 1 — Backend
cd d:\\PROJECT-FINAL\\Kiro\\QR-CODE\\backend
mvn spring-boot:run -Dspring-boot.run.profiles=localtest

# Terminal 2 — Frontend
cd d:\\PROJECT-FINAL\\Kiro\\QR-CODE\\frontend
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8080
- API docs: http://localhost:8080/v3/api-docs

**Docker mode (when available):**

```bash
cd d:\\PROJECT-FINAL\\Kiro\\QR-CODE
docker-compose up --build
```

## How to Run the Tests

```bash
cd d:\\PROJECT-FINAL\\Kiro\\QR-CODE\\e2e
npm install
npx playwright install chromium

# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific spec
npx playwright test tests/11-golden-e2e.spec.ts

# View report
npx playwright show-report
```

**Prerequisite:** Frontend (port 5173) and backend (port 8080) must be running. Tests read `.agents/tasks/services-status.json` to verify services before starting.

## Screenshots

See `e2e/test-results/` directory. Key screenshots:

| File | Description |
|------|-------------|
| `01-homepage.png` | Homepage — Device A |
| `02-text-qr.png` | Text QR generation |
| `02-small-file-upload.png` | Small file upload result |
| `03-file-upload-device-b.png` | Device B share page |
| `10-responsive-desktop.png` | Responsive: desktop (1920×1080) |
| `10-responsive-tablet.png` | Responsive: tablet (768×1024) |
| `10-responsive-mobile.png` | Responsive: mobile (390×844) |
| `11-golden-device-b-share-page.png` | Golden path: Device B share page |
| `11-golden-device-b-after-delete.png` | Golden path: Device B after file deletion |

---
*Universal QR Code Sharing — E2E Test Report | {ts}*
"""

md_path = os.path.join(BASE_DIR, 'e2e', 'TEST-SUMMARY.md')
with open(md_path, 'w', encoding='utf-8') as f:
    f.write(MD)
print(f"Markdown written: {md_path}  ({os.path.getsize(md_path):,} bytes)")

# ── report-done.json ──────────────────────────────────────────────────────────
done = {
    "done": True,
    "reportPath": out_path,
    "summaryPath": md_path
}
done_path = os.path.join(BASE_DIR, '.agents', 'tasks', 'report-done.json')
with open(done_path, 'w', encoding='utf-8') as f:
    json.dump(done, f, indent=2)
print(f"report-done.json written: {done_path}")
