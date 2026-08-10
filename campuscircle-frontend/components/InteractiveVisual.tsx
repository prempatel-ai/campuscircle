"use client";

import React, { useState, useEffect, useId, useMemo } from "react";

interface InteractiveVisualProps {
  visualHtml: string;
  title?: string;
}

export function InteractiveVisual({ visualHtml, title }: InteractiveVisualProps) {
  const instanceId = useId().replace(/:/g, "_");
  const [iframeHeight, setIframeHeight] = useState<number>(280);

  // Injected height reporter script that measures scrollHeight and posts message to parent window
  const injectedScript = `
    <script>
      (function() {
        function sendHeight() {
          try {
            var body = document.body;
            var html = document.documentElement;
            var h = Math.max(
              body ? body.scrollHeight : 0,
              body ? body.offsetHeight : 0,
              html ? html.clientHeight : 0,
              html ? html.scrollHeight : 0,
              html ? html.offsetHeight : 0
            );
            if (h > 0) {
              window.parent.postMessage({ type: 'VISUAL_HEIGHT', instanceId: '${instanceId}', height: h }, '*');
            }
          } catch(e) {}
        }
        window.addEventListener('load', sendHeight);
        window.addEventListener('resize', sendHeight);
        document.addEventListener('DOMContentLoaded', sendHeight);
        if (typeof ResizeObserver !== 'undefined' && document.body) {
          try { new ResizeObserver(sendHeight).observe(document.body); } catch(e) {}
        }
        setTimeout(sendHeight, 100);
        setTimeout(sendHeight, 400);
      })();
    </script>
  `;

  // Inject height reporter script into visualHtml before </body> or at the end
  const preparedHtml = useMemo(() => {
    if (!visualHtml) return "";
    if (visualHtml.includes("</body>")) {
      return visualHtml.replace("</body>", `${injectedScript}</body>`);
    }
    return visualHtml + injectedScript;
  }, [visualHtml, instanceId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.data &&
        event.data.type === "VISUAL_HEIGHT" &&
        event.data.instanceId === instanceId &&
        typeof event.data.height === "number" &&
        event.data.height > 0
      ) {
        // Add 16px buffer to avoid any clipping
        setIframeHeight(event.data.height + 16);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [instanceId]);

  if (!visualHtml) return null;

  return (
    <div className="bg-background border border-border-muted/80 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs transition-all">
      <div className="flex items-center justify-between gap-2 border-b border-border-muted/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-mono text-[11px] font-bold text-primary uppercase tracking-wider">
            Interactive Visual Simulation
          </span>
        </div>
        {title && (
          <span className="font-sans text-xs text-ink/60 font-medium truncate max-w-[200px] sm:max-w-[300px]">
            {title}
          </span>
        )}
      </div>

      <div className="w-full rounded-xl overflow-hidden border border-border-muted/60 bg-surface shadow-inner">
        <iframe
          title={title || "Interactive Concept Visual"}
          srcDoc={preparedHtml}
          /* SECURITY REQUIREMENT: sandbox="allow-scripts" ONLY.
             Explicitly NO allow-same-origin, NO allow-top-navigation, NO allow-popups, NO allow-forms.
             Dynamic height auto-resizing is handled securely via postMessage.
          */
          sandbox="allow-scripts"
          scrolling="no"
          style={{ height: `${iframeHeight}px`, overflow: "hidden" }}
          className="w-full border-0 block bg-transparent transition-[height] duration-200"
        />
      </div>
    </div>
  );
}
