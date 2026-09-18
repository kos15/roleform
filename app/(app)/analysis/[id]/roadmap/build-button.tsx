"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorRegion } from "@/components/ui";
import { CapWallDialog } from "@/components/cap-wall";
import { buildRoadmap } from "@/app/actions/roadmap";
import type { CapWall } from "@/lib/domain/quotas";

export function BuildButton({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [capWall, setCapWall] = useState<CapWall | null>(null);
  const [pending, startTransition] = useTransition();

  function build() {
    setError(null);
    startTransition(async () => {
      const result = await buildRoadmap(analysisId);
      if (!result.ok) {
        if (result.error.capWall) setCapWall(result.error.capWall);
        else setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {capWall ? <CapWallDialog wall={capWall} onClose={() => setCapWall(null)} /> : null}
      {error ? <ErrorRegion title="That didn't build">{error}</ErrorRegion> : null}
      <Button onClick={build} disabled={pending} busy={pending}>
        {pending ? "Building…" : "Build the roadmap"}
      </Button>
    </>
  );
}
