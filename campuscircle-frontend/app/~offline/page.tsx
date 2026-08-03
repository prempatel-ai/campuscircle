"use client";

export default function OfflinePage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Offline — CampusCircle</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #F5F6F4;
                color: #1A1C1A;
                font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
              }
              .container {
                text-align: center;
                padding: 2rem;
                max-width: 420px;
              }
              .icon {
                width: 72px; height: 72px;
                margin: 0 auto 1.5rem;
                background: #2F5233;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
              }
              .icon svg {
                width: 36px; height: 36px;
                stroke: #F5F6F4;
                fill: none;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
              }
              h1 {
                font-size: 1.5rem;
                font-weight: 800;
                color: #2F5233;
                margin-bottom: 0.5rem;
                font-family: 'Space Grotesk', Inter, sans-serif;
              }
              p {
                font-size: 0.875rem;
                color: #1A1C1A99;
                line-height: 1.6;
                margin-bottom: 1.5rem;
              }
              button {
                padding: 0.75rem 1.5rem;
                background: #2F5233;
                color: #F5F6F4;
                border: none;
                border-radius: 0.75rem;
                font-size: 0.8125rem;
                font-weight: 700;
                cursor: pointer;
                transition: background 0.15s;
              }
              button:hover { background: #1F3E23; }
            `,
          }}
        />
      </head>
      <body>
        <div className="container">
          <div className="icon">
            <svg viewBox="0 0 24 24">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>
          <h1>You&apos;re Offline</h1>
          <p>
            CampusCircle needs an internet connection to load your feed,
            conversations, and campus discussions. Please check your
            connection and try again.
          </p>
          <button onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
