'use client';

import { useEffect, useRef } from 'react';

export default function NexusPageRenderer({ pageData }) {
  const hostRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const addedNodes = [];

    if (pageData.title) {
      document.title = pageData.title;
    }

    (pageData.externalCss || []).forEach((href) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        addedNodes.push(link);
      }
    });

    async function runScriptsSequentially() {
      const externalScripts = (pageData.scripts || []).filter((s) => s.src);
      const inlineScripts = (pageData.scripts || []).filter((s) => s.inline);

      // 1. Load external scripts first before patching DOMContentLoaded
      for (const s of externalScripts) {
        if (cancelled) return;
        const alreadyLoaded = document.querySelector(`script[data-nexus-src="${s.src}"]`);
        if (alreadyLoaded) continue;
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = s.src;
          script.setAttribute('data-nexus-src', s.src);
          if (s.id) script.id = s.id;
          script.async = false;
          script.onload = resolve;
          script.onerror = resolve;
          document.body.appendChild(script);
        });
      }

      if (cancelled) return;

      // 2. Patch DOMContentLoaded / load synchronously right around inline scripts
      const origDocAddListener = document.addEventListener.bind(document);
      const origWinAddListener = window.addEventListener.bind(window);
      const deferredReadyCallbacks = [];

      document.addEventListener = function (type, listener, options) {
        if (type === 'DOMContentLoaded' && typeof listener === 'function') {
          deferredReadyCallbacks.push(listener);
          return;
        }
        return origDocAddListener(type, listener, options);
      };

      window.addEventListener = function (type, listener, options) {
        if (type === 'load' && typeof listener === 'function') {
          deferredReadyCallbacks.push(listener);
          return;
        }
        return origWinAddListener(type, listener, options);
      };

      try {
        for (const s of inlineScripts) {
          if (cancelled) break;
          const sig = `${pageData.name}_${s.inline.length}_${s.inline.slice(0, 40)}`;
          if (window.__nexusRanInline && window.__nexusRanInline[sig]) continue;
          window.__nexusRanInline = window.__nexusRanInline || {};
          window.__nexusRanInline[sig] = true;

          const script = document.createElement('script');
          if (s.id) script.id = s.id;
          script.textContent = s.inline;
          document.body.appendChild(script);
          addedNodes.push(script);
        }
      } finally {
        document.addEventListener = origDocAddListener;
        window.addEventListener = origWinAddListener;
      }

      if (!cancelled) {
        for (const cb of deferredReadyCallbacks) {
          try {
            cb();
          } catch (err) {
            console.error('[NexusPageRenderer] Ready callback error:', err);
          }
        }
      }
    }

    runScriptsSequentially();

    return () => {
      cancelled = true;
      addedNodes.forEach((n) => {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
    };
  }, [pageData]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: pageData.css }} />
      <div
        ref={hostRef}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: pageData.bodyHtml }}
      />
    </>
  );
}
