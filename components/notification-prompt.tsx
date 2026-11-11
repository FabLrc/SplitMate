"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

type State = "loading" | "prompt" | "subscribed" | "denied" | "unsupported" | "dismissed";

// Permission, capability and dismissal are external state: read them with
// useSyncExternalStore instead of copying them into React state from an effect.
function detect(): State | "granted" {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window))
    return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (sessionStorage.getItem("push-dismissed")) return "dismissed";
  return "prompt";
}

const subscribeToNothing = () => () => {};

export function NotificationPrompt() {
  const detected = useSyncExternalStore(subscribeToNothing, detect, () => "loading" as const);
  const [state, setState] = useState<State | null>(null);

  const subscribe = useCallback(async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });
    }

    const serialized = sub.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: serialized.endpoint,
        keys: serialized.keys,
      }),
    });
  }, []);

  useEffect(() => {
    // Already granted — silently subscribe (handles new devices)
    if (detected !== "granted") return;
    subscribe().then(() => setState("subscribed"));
  }, [detected, subscribe]);

  async function handleEnable() {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await subscribe();
      setState("subscribed");
    } else {
      setState("denied");
    }
  }

  function handleDismiss() {
    sessionStorage.setItem("push-dismissed", "1");
    setState("dismissed");
  }

  const current = state ?? (detected === "granted" ? "loading" : detected);

  if (current !== "prompt") return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-sm mx-auto z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Activer les notifications
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Recevez un rappel pour mettre vos comptes a jour et un recapitulatif mensuel.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleDismiss}>
            Plus tard
          </Button>
          <Button size="sm" className="flex-1" onClick={handleEnable}>
            Activer
          </Button>
        </div>
      </div>
    </div>
  );
}
