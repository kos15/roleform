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
      <Card className="flex max-w-[860px] items-center gap-3.5 px-[26px] py-6 text-[17px] font-semibold">
        <Loader2 className="lucide h-5 w-5 animate-spin" />
        <span>
          {step === "saving" ? "Saving your profile…" : `Reading ${filename}…`}
        </span>
      </Card>
    );
  }

  return (
    <div className="max-w-[860px] space-y-[18px]">
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
        className="block cursor-pointer rounded-[var(--radius-xl)] border-2 border-dashed px-7 py-[clamp(2.5rem,6vw,4.5rem)] text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--color-accent-600)" : "var(--color-line-strong)",
          background: dragging ? "var(--color-accent-100)" : "var(--color-bg-raised)",
        }}
      >
        <span className="mx-auto mb-5 grid h-[68px] w-[68px] place-items-center rounded-[var(--radius-pill)] bg-[var(--color-accent-500)]">
          <Upload className="lucide h-[26px] w-[26px]" />
        </span>
        <span className="display block text-[clamp(1.6rem,3vw,2.15rem)] leading-[1.05]">
          Drop your résumé here, or choose a file
        </span>
        <span className="mb-[22px] mt-2.5 block text-[15px] text-[var(--color-text-muted)]">
          PDF, DOCX or TXT · up to 5 MB
        </span>
        {/* A span, not a button: the whole label is the control. */}
        <span className="btn btn-primary">Choose a file</span>
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

      <Card
        flat
        className="card-outline px-6 py-[22px] text-[15px] leading-relaxed text-[var(--color-text-muted)]"
      >
        <div className="mb-2 flex items-center gap-2 text-base font-extrabold text-[var(--color-text)]">
          <CheckCircle2 className="lucide h-[18px] w-[18px]" /> You review everything before it saves
        </div>
        We show you what we read, next to what you uploaded. Nothing enters your profile until
        you confirm it.
        {/* Two pills of `nowrap` text: without wrapping they push the whole
            onboarding page into a sideways scroll on any phone. */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Tag className="min-h-8 px-3.5">No training on your documents</Tag>
          <Tag className="min-h-8 px-3.5">Delete removes the file too</Tag>
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
