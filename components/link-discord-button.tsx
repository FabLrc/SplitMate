"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LinkDiscordButton() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        // The user must already be signed in: Auth.js then links the Discord
        // account to the current session user instead of matching by email.
        void signIn("discord", { callbackUrl: "/dashboard" }).finally(() =>
          setLoading(false)
        );
      }}
    >
      {loading ? "Redirection…" : "Lier mon compte Discord"}
    </Button>
  );
}
