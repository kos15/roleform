import { Card, Skeleton } from "@/components/ui";

/**
 * Route-level loading shapes.
 *
 * Each one mirrors the layout it stands in for, so content landing doesn't
 * reflow the page. They exist for a second reason too: a `loading.tsx` creates
 * the Suspense boundary that lets Next prefetch a dynamic route at all, so the
 * tabs get faster as well as feeling faster.
 */

function Header() {
  return (
    <div className="mb-5 space-y-2">
      <Skeleton className="h-7 w-80 max-w-full" />
      <Skeleton className="h-4 w-[34rem] max-w-full" />
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
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-28 rounded-[var(--radius-md)]" />
              <Skeleton className="h-28 rounded-[var(--radius-md)]" />
            </div>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Skeleton className="h-9 w-64 rounded-[var(--radius-pill)]" />
        <Card className="space-y-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${100 - (i % 4) * 11}%` }} />
          ))}
        </Card>
      </div>
      <aside className="space-y-5">
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
