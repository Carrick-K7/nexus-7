"use client";

import {
  FlaskConical,
} from "lucide-react";
import {
  useTranslation,
} from "@/hooks/useTranslation";

export default function SandboxNotice() {
  const { t } = useTranslation();

  return (
    <aside
      data-testid="sandbox-notice"
      className="flex items-start gap-3 rounded-lg border border-cyber-yellow/35 bg-cyber-yellow/5 p-3 text-sm"
    >
      <FlaskConical
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-cyber-yellow"
      />
      <div>
        <p className="font-medium text-cyber-yellow">
          {t("narrativeSandbox")}
        </p>
        <p className="mt-1 text-xs text-cyber-text-dim">
          {t("narrativeSandboxDesc")}
        </p>
      </div>
    </aside>
  );
}
