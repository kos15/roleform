"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { Button, Card, ErrorRegion, Tag } from "@/components/ui";
import { commitProfile, extractProfile, uploadResume } from "@/app/actions/onboarding";
import type { ExtractProfileResult } from "@/lib/ai/schemas/resume-json";
import { ReviewScreen } from "./review-screen";

type Step = "upload" | "extracting" | "review" | "saving";

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [draft, setDraft] = useState<ExtractProfileResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    setFilename(file.name);
    setStep("extracting");

    const formData = new FormData();
    formData.append("file", file);

    const uploaded = await uploadResume(formData);
    if (!uploaded.ok) {
      setError({ title: uploaded.error.message });
      setStep("upload");
      return;
    }

    setDocumentId(uploaded.value.documentId);

    const extracted = await extractProfile(uploaded.value.documentId);
    if (!extracted.ok) {
      setError({ title: extracted.error.message });
      setStep("upload");
      return;
    }

    setDraft(extracted.value);
    setStep("review");
  }

  function handleCommit(edited: ExtractProfileResult["resume"]) {
    setError(null);
    setStep("saving");
    startTransition(async () => {
      const result = await commitProfile(edited, documentId);
      if (!result.ok) {
        setError({ title: result.error.message });
        setStep("review");
        return;
      }
      router.push("/analyze");
    });
  }

  if (step === "review" && draft) {
    return (
      <>
        {error ? <ErrorRegion title={error.title} /> : null}
        <ReviewScreen
          draft={draft}
          filename={filename}
          onCommit={handleCommit}
          onStartOver={() => {
            setDraft(null);
            setStep("upload");
          }}
        />
      </>
    );
  }

  if (step === "extracting" || step === "saving" || pending) {
    return (
      <Card className="flex items-center gap-3">
        <Loader2 className="lucide h-5 w-5 animate-spin text-[var(--color-accent-600)]" />
        <span>
          {step === "saving" ? "Saving your profile…" : `Reading ${filename}…`}
        </span>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorRegion title={error.title} /> : null}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className="block cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed p-12 text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--color-accent-500)" : "var(--color-line)",
          background: dragging ? "var(--color-accent-100)" : "var(--color-bg-raised)",
        }}
      >
        <Upload className="lucide mx-auto mb-4 h-7 w-7 text-[var(--color-accent-600)]" />
        <span className="mb-1 block text-lg font-semibold">
          Drop your résumé here, or choose a file
        </span>
        <span className="block text-sm text-[var(--color-text-muted)]">
          PDF, DOCX or TXT · up to 5 MB
        </span>
        <input
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      <Card flat className="text-sm text-[var(--color-text-muted)]">
        <div className="mb-2 flex items-center gap-2 font-semibold text-[var(--color-text)]">
          <CheckCircle2 className="lucide h-4 w-4" /> You review everything before it saves
        </div>
        We show you what we read, next to what you uploaded. Nothing enters your profile until
        you confirm it.
        <div className="mt-3 flex gap-2">
          <Tag tone="muted">No training on your documents</Tag>
          <Tag tone="muted">Delete removes the file too</Tag>
        </div>
      </Card>
    </div>
  );
}

export function CommitButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button onClick={onClick} disabled={disabled}>
      Save profile
    </Button>
  );
}
