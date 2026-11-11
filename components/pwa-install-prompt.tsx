"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Prompt = "install" | "ios";

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    // Already running as installed PWA — hide
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
      return;

    // Don't re-show if dismissed this session
    if (sessionStorage.getItem("pwa-prompt-dismissed")) return;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      // Show iOS instructions after a short delay
      const t = setTimeout(() => setPrompt("ios"), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setPrompt("install");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
    setInstallPrompt(null);
  }

  function dismiss() {
    setPrompt(null);
    // Don't show again this session
    sessionStorage.setItem("pwa-prompt-dismissed", "1");
  }

  if (!prompt) return null;
  const isIos = prompt === "ios";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      <div className="mx-auto max-w-3xl">
        <div className="m-3 rounded-2xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 shadow-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 dark:bg-zinc-700 flex items-center justify-center text-2xl shrink-0">
              💸
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                Installer SplitMate
              </p>
              {isIos ? (
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Appuyez sur{" "}
                  <span className="inline-block border border-zinc-500 rounded px-1 text-zinc-300 font-mono text-[10px]">
                    ⎋
                  </span>{" "}
                  puis <strong className="text-zinc-300">« Sur l&apos;écran d&apos;accueil »</strong>
                </p>
              ) : (
                <p className="text-xs text-zinc-400 mt-0.5">
                  Accédez à vos dépenses directement depuis votre écran d&apos;accueil
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isIos && (
                <button
                  onClick={handleInstall}
                  className="text-sm bg-white text-zinc-900 px-3 py-2 rounded-xl font-semibold hover:bg-zinc-100 transition-colors"
                >
                  Installer
                </button>
              )}
              <button
                onClick={dismiss}
                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
