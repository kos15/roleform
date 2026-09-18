import { Card, Skeleton } from "@/components/ui";

/**
 * Route-level loading shapes.
 *
 * Each one mirrors the layout it stands in for, so content landing doesn't
 * reflow the page. They exist for a second reason too: a `loading.tsx` creates
 * the Suspense boundary that lets Next prefetch a dynamic route at all, so the
 * route gets faster as well as feeling faster.
 *
 * Every route that does server work gets one. A page that reads the database
 * or the identity provider and has no boundary shows the PREVIOUS page until
 * the round trip finishes — which reads as a dead click, and is the one
 * failure a spinner genuinely prevents.
 */

function Header() {
  return (
    <div className="mb-5 space-y-2">
      <Skeleton className="h-7 w-80 max-w-full" />
      <Skeleton className="h-4 w-[34rem] max-w-full" />
    </div>
  );
}

/** Kicker · title · standfirst — the opening of every written page. */
function PageIntroSkeleton() {
  return (
    <div className="mb-8 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-[30rem] max-w-full" />
      <Skeleton className="h-4 w-[36rem] max-w-full" />
      <Skeleton className="h-4 w-[28rem] max-w-full" />
    </div>
  );
}

/**
 * The landing page.
 *
 * It reads nothing from the database, but Clerk's middleware runs on it, so the
 * build reports it as `ƒ` — server-rendered on demand — and a click on the
 * wordmark from anywhere inside the app holds the old screen until it returns.
 * That is the same dead click every other route here exists to prevent.
 */
export function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <div className="max-w-2xl space-y-4">
        <Skeleton className="mb-6 h-6 w-52 rounded-[var(--radius-pill)]" />
        <Skeleton className="h-11 w-[26rem] max-w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="mt-6 h-10 w-44 rounded-[var(--radius-pill)]" />
      </div>

      <div className="mt-24 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3">
            <Skeleton className="mb-4 h-6 w-6" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </Card>
        ))}
      </div>

      <div className="mt-16 max-w-xl space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
      </div>
    </div>
  );
}

export function PrepSkeleton() {
  return (
    <section>
      <Header />
      <div className="mb-6 flex flex-wrap gap-2">
        {[6, 7, 5.5, 7.5, 6.5].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-[var(--radius-pill)]" style={{ width: `${w}rem` }} />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <div className="flex items-start gap-4">
              <Skeleton className="h-7 w-7 shrink-0 rounded-[var(--radius-pill)]" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-5 w-full max-w-[42rem]" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-6 w-28 rounded-[var(--radius-pill)]" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function LearningSkeleton() {
  return (
    <section>
      <Header />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-28 rounded-[var(--radius-pill)]" />
              <Skeleton className="h-6 w-24 rounded-[var(--radius-pill)]" />
            </div>
            <Skeleton className="h-4 w-full max-w-[46rem]" />
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(248px,100%),1fr))]">
              <Skeleton className="h-28 rounded-[var(--radius-md)]" />
              <Skeleton className="h-28 rounded-[var(--radius-md)]" />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function RoadmapSkeleton() {
  return (
    <section>
      <Skeleton className="mb-5 h-4 w-32" />
      <div className="space-y-6">
        {[0, 1, 2].map((section) => (
          <div key={section}>
            <Skeleton className="mb-2 h-5 w-24" />
            <div className="space-y-2.5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 flex-none rounded-[var(--radius-pill)]" />
                  <Skeleton className="h-4 w-full max-w-[28rem]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function JobsSkeleton() {
  return (
    <section>
      <PageIntroSkeleton />
      <Card className="mb-6 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1.3fr_auto]">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-24" />
        </div>
      </Card>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-2">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full max-w-[36rem]" />
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ResumesSkeleton() {
  return (
    <section>
      <Header />
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(238px,100%),1fr))]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="space-y-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-6 w-20 rounded-[var(--radius-pill)]" />
              <Skeleton className="h-6 w-24 rounded-[var(--radius-pill)]" />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function PreviewSkeleton() {
  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="min-w-0 flex-[1_1_32rem] space-y-4">
        <Skeleton className="h-9 w-64 rounded-[var(--radius-pill)]" />
        <Card className="space-y-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${100 - (i % 4) * 11}%` }} />
          ))}
        </Card>
      </div>
      <aside className="min-w-0 flex-[0_1_21rem] space-y-5">
        <Card className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-[var(--radius-pill)]" />
            <Skeleton className="h-6 w-24 rounded-[var(--radius-pill)]" />
          </div>
          <Skeleton className="h-9 w-full rounded-[var(--radius-pill)]" />
        </Card>
        <Card className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </Card>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ app surfaces */

export function AdminSkeleton() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-[38rem] max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-[var(--radius-pill)]" />
          <Skeleton className="h-9 w-40 rounded-[var(--radius-pill)]" />
        </div>
      </div>

      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="space-y-2.5 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] px-[1.125rem] py-4"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-[5px] w-full rounded-[var(--radius-pill)]" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-[min(300px,100%)] flex-1 basis-[520px] space-y-3">
          <Skeleton className="h-6 w-28" />
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3.5 border-b border-[var(--color-line)] px-4 py-3.5 last:border-b-0"
              >
                <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-[var(--radius-pill)]" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-6 w-16 rounded-[var(--radius-pill)]" />
              </div>
            ))}
          </div>
        </div>
        <aside className="min-w-[min(290px,100%)] max-w-[440px] flex-1 basis-[330px]">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-[42px] w-[42px] shrink-0 rounded-[var(--radius-pill)]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 border-t border-[var(--color-line)] pt-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-[5px] w-full rounded-[var(--radius-pill)]" />
              </div>
            ))}
          </Card>
        </aside>
      </div>

      {/* The plan strip. Two cards because there are two plans and there is no
          state in which there are more — a placeholder count that can't be
          wrong is worth the hard-coded pair. */}
      <div className="mt-9 border-t border-[var(--color-line)] pt-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-[34rem] max-w-full" />
          </div>
          <Skeleton className="h-9 w-44 rounded-[var(--radius-pill)]" />
        </div>
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[1.125rem_1.25rem]"
            >
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-7 w-24" />
              <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
                {[0, 1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-3 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyzeSkeleton() {
  return (
    <div>
      <div className="mb-8 max-w-[620px] space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-[26rem] max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex flex-wrap items-start gap-7">
        <div className="min-w-0 flex-[1_1_30rem] space-y-4">
          <Skeleton className="h-10 w-56 rounded-[var(--radius-pill)]" />
          <Skeleton className="h-[16.5rem] w-full rounded-[var(--radius-lg)]" />
          <div className="flex justify-end gap-2">
            <Skeleton className="h-9 w-40 rounded-[var(--radius-pill)]" />
            <Skeleton className="h-9 w-36 rounded-[var(--radius-pill)]" />
          </div>
        </div>
        <aside className="min-w-0 flex-[0_1_22rem] space-y-4">
          <Card className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-9 w-full rounded-[var(--radius-pill)]" />
          </Card>
          <div className="space-y-2.5 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <section>
      <Skeleton className="mb-6 h-9 w-44" />
      <Card className="space-y-3 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 flex-1 basis-48" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-6 w-20 rounded-[var(--radius-pill)]" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </Card>
    </section>
  );
}

export function ProfileSkeleton() {
  return (
    <div>
      <PageIntroSkeleton />
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-[min(300px,100%)] flex-1 basis-[560px] space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-3">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
        <aside className="min-w-[min(262px,100%)] max-w-[330px] flex-1 basis-[280px] space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-5">
            <Skeleton className="mx-auto mb-3.5 h-[132px] w-[132px] rounded-[var(--radius-pill)]" />
            <Skeleton className="h-3 w-full" />
          </div>
          <div className="space-y-2.5 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[1.125rem]">
            <Skeleton className="h-3 w-40" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function OnboardingSkeleton() {
  return (
    <div className="max-w-3xl space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-[30rem] max-w-full" />
      <Skeleton className="mb-8 h-4 w-[26rem] max-w-full" />
      <Skeleton className="h-56 w-full rounded-[var(--radius-lg)]" />
      <Card className="space-y-2.5">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-full" />
      </Card>
    </div>
  );
}

/**
 * The analysis shell — score ring, its three buckets, the tab bar.
 *
 * N4 in a loading state too: the ring's placeholder never appears without the
 * three bucket placeholders beside it, because a number that can arrive alone
 * is a number that can be read alone.
 */
export function AnalysisSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="mb-2 h-3 w-56" />
        <div className="mb-6 flex flex-wrap items-start gap-8">
          <div className="flex items-center gap-5">
            <Skeleton className="h-[120px] w-[120px] shrink-0 rounded-[var(--radius-pill)]" />
            <div className="max-w-sm space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-2.5">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-6 w-24 rounded-[var(--radius-pill)]" />
              <Skeleton className="h-6 w-32 rounded-[var(--radius-pill)]" />
            </Card>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-40 rounded-[var(--radius-pill)]" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ marketing surfaces */

/** how-it-works · privacy · terms — one shape, three documents. */
export function DocSkeleton() {
  return (
    <article className="mx-auto w-full max-w-[760px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntroSkeleton />
      <div className="mt-8 space-y-6">
        {[0, 1, 2, 3].map((i) => (
          <section key={i} className="space-y-2.5 border-t border-[var(--color-line)] pt-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </section>
        ))}
      </div>
    </article>
  );
}

export function StatusSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[860px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.75rem)] pb-16">
      <div className="mb-7 flex flex-wrap items-center gap-6">
        <Skeleton className="h-[76px] w-[76px] shrink-0 rounded-[var(--radius-pill)]" />
        <div className="min-w-[min(260px,100%)] flex-1 space-y-2.5">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      <div className="mb-4.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-bg-raised)] px-[1.125rem] py-4 last:border-b-0"
          >
            <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-[var(--radius-pill)]" />
            <div className="min-w-0 flex-1 basis-[220px] space-y-1.5">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-3 w-full max-w-[26rem]" />
            </div>
            <Skeleton className="h-6 w-24 shrink-0 rounded-[var(--radius-pill)]" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-36 min-w-[min(280px,100%)] flex-1 basis-80 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-36 min-w-[min(250px,100%)] flex-1 basis-60 rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}

export function SupportSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntroSkeleton />
      <div className="mb-9 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[1.375rem]"
          >
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-pill)]" />
          </div>
        ))}
      </div>
      <section className="space-y-3.5 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[clamp(1.25rem,3vw,1.625rem)]">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[7px] w-full rounded-[var(--radius-pill)]" />
            <Skeleton className="h-3 w-64" />
          </div>
        ))}
      </section>
    </div>
  );
}

export function ContactSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntroSkeleton />
      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-[min(290px,100%)] flex-1 basis-[400px] space-y-3.5 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[clamp(1.25rem,3vw,1.625rem)]">
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
            <Skeleton className="h-16 rounded-[var(--radius-lg)]" />
            <Skeleton className="h-16 rounded-[var(--radius-lg)]" />
          </div>
          <Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-9 w-36 rounded-[var(--radius-pill)]" />
        </section>
        <aside className="min-w-[min(250px,100%)] max-w-[330px] flex-1 basis-[260px] space-y-3.5">
          <Skeleton className="h-44 rounded-[var(--radius-lg)]" />
          <Skeleton className="h-36 rounded-[var(--radius-lg)]" />
        </aside>
      </div>
    </div>
  );
}

/**
 * The footer, while its health read is in flight.
 *
 * Not a skeleton of the whole footer — the three link columns are static and
 * can paint immediately. Only the live dot beside Status waits, so only its row
 * gets a placeholder (see components/site-footer.tsx).
 */
export function FooterSkeleton() {
  return (
    <div className="mt-auto border-t border-[var(--color-line)] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.6rem,4vw,2.25rem)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start justify-between gap-7">
        <div className="max-w-[34ch] space-y-2.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="flex flex-wrap gap-9">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PricingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntroSkeleton />
      <div className="mb-10 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[clamp(1.25rem,3vw,1.625rem)]"
          >
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="space-y-2 border-t border-[var(--color-line)] pt-3.5">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex justify-between gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
            <Skeleton className="h-9 w-full rounded-[var(--radius-pill)]" />
          </div>
        ))}
      </div>
      <section className="space-y-3.5 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[clamp(1.25rem,3vw,1.625rem)]">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5 border-t border-[var(--color-line)] pt-3.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-full max-w-[40rem]" />
          </div>
        ))}
      </section>
    </div>
  );
}

/**
 * Appearance (F18). Six cards, because six is what always arrives — the
 * palettes are a compile-time list, not a query.
 */
export function AppearanceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[72rem] px-6 py-12">
      <PageIntroSkeleton />
      <div className="mb-7 flex justify-end">
        <Skeleton className="h-10 w-40 rounded-[var(--radius-pill)]" />
      </div>
      <div className="mb-8 grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr))]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="space-y-3.5 rounded-[30px] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-5"
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-[27px] w-[27px] rounded-[var(--radius-pill)]" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-[34px] w-full rounded-xl" />
            <Skeleton className="h-8 w-3/4 rounded-[var(--radius-pill)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
