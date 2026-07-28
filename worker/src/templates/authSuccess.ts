/**
 * HTML template rendered after successfully completing MCP server OAuth authorization.
 * Displays a success badge and automatically attempts to close the window after a 3-second countdown.
 *
 * @returns {string} The full HTML document string for the success page.
 */
export function getAuthSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorization Complete</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      background: #121214;
      color: #f4f4f5;
    }
    main {
      max-width: 420px;
      text-align: center;
    }
    .checkmark {
      width: 72px;
      height: 72px;
      margin: 0 auto 24px;
      position: relative;
    }
    .checkmark .badge {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 28px;
      height: 28px;
      background: #22c55e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid #121214;
    }
    .checkmark .badge svg {
      width: 16px;
      height: 16px;
    }
    h1 {
      margin-bottom: 12px;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.03em;
      color: #ffffff;
    }
    p {
      color: #a1a1aa;
      font-size: 15px;
      line-height: 1.6;
    }
    .hint {
      margin-top: 24px;
      color: #71717a;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <main>
    <div class="checkmark">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="100%" height="100%">
        <circle cx="75" cy="75" r="63" fill="#000000" stroke="#ffffff" stroke-width="14" />
        <circle cx="75" cy="75" r="30" fill="#e60000" />
        <circle cx="61" cy="61" r="9" fill="#ffffff" />
      </svg>
      <div class="badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 12l3 3 7-7"/>
        </svg>
      </div>
    </div>
    <h1>Authorization complete</h1>
    <p>The plugin has been connected successfully. Closing in <span id="countdown" style="font-weight: 600">3</span>s.</p>
  </main>
  <script>
    let secondsLeft = 3;
    const countdownEl = document.getElementById('countdown');
    const interval = setInterval(() => {
      secondsLeft--;
      if (countdownEl) {
        countdownEl.textContent = secondsLeft;
      }
      if (secondsLeft <= 0) {
        clearInterval(interval);
        window.close();
      }
    }, 1000);
    // Fallback close call
    setTimeout(() => {
      window.close();
    }, 3000);
  </script>
</body>
</html>`;
}
