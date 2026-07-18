import PropTypes from 'prop-types';

const SkeletonBlock = ({ className = '' }) => (
  <span aria-hidden="true" className={`loading-skeleton-block block ${className}`} />
);

SkeletonBlock.propTypes = {
  className: PropTypes.string,
};

const Panel = ({ children, className = '' }) => (
  <div className={`rounded-lg border border-zinc-800/70 bg-zinc-900/45 ${className}`}>
    {children}
  </div>
);

Panel.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

const ListRows = ({ count = 4, height = 'h-14' }) => (
  <div className="space-y-3">
    {Array.from({ length: count }, (_, index) => (
      <SkeletonBlock key={index} className={`${height} w-full`} />
    ))}
  </div>
);

ListRows.propTypes = {
  count: PropTypes.number,
  height: PropTypes.string,
};

const StaffSkeleton = () => (
  <div className="mx-auto max-w-450 px-0 2xl:px-6">
    <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-3">
        <SkeletonBlock className="h-9 w-56 max-w-[70vw]" />
        <SkeletonBlock className="h-4 w-44 max-w-[55vw]" />
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-8 w-50" />
        <SkeletonBlock className="h-10 w-10" />
      </div>
    </div>

    <div className="mb-4 md:hidden">
      <SkeletonBlock className="h-11 w-full" />
    </div>

    <div className="grid grid-cols-12 gap-6">
      <Panel className="hidden p-4 md:col-span-3 md:block">
        <div className="space-y-5">
          <div className="space-y-2">
            <SkeletonBlock className="mx-4 h-3 w-28" />
            <ListRows count={6} height="h-10" />
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="mx-4 h-3 w-24" />
            <ListRows count={4} height="h-10" />
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 min-h-128 p-5 sm:p-6 md:col-span-9">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-7 w-52" />
            <SkeletonBlock className="h-4 w-72 max-w-full" />
          </div>
          <SkeletonBlock className="h-10 w-36" />
        </div>
        <SkeletonBlock className="mb-5 h-11 w-full" />
        <ListRows count={5} height="h-16" />
      </Panel>
    </div>
  </div>
);

const DivisionCardSkeleton = ({ rows = 3 }) => (
  <Panel className="p-5">
    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-5 w-5 rounded-full" />
        <SkeletonBlock className="h-6 w-28" />
        <SkeletonBlock className="h-5 w-8 rounded-full" />
      </div>
      <SkeletonBlock className="h-10 w-32" />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-lg border border-zinc-800/70 bg-zinc-900/45 p-4">
          <div className="flex items-start gap-3">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-5 w-32 max-w-full" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
            <SkeletonBlock className="h-8 w-8" />
          </div>
          <div className="mt-3 border-t border-zinc-800/70 pt-3">
            <SkeletonBlock className="h-6 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  </Panel>
);

DivisionCardSkeleton.propTypes = {
  rows: PropTypes.number,
};

const DivisionSkeleton = () => (
  <div className="mx-auto max-w-6xl px-0 sm:px-4">
    <div className="mb-6 space-y-2">
      <SkeletonBlock className="h-8 w-56 max-w-[70vw]" />
      <SkeletonBlock className="h-4 w-36" />
    </div>
    <div className="space-y-6">
      <DivisionCardSkeleton />
      <DivisionCardSkeleton />
    </div>
  </div>
);

const AccountSkeleton = () => (
  <div className="mx-auto max-w-5xl px-0 sm:px-6">
    <SkeletonBlock className="mb-8 h-10 w-64 max-w-[75vw]" />
    <div className="space-y-8">
      <Panel className="p-5 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <SkeletonBlock className="h-7 w-44" />
            <SkeletonBlock className="h-4 w-28" />
          </div>
          <SkeletonBlock className="h-11 w-40" />
        </div>
      </Panel>
      <Panel className="p-5 sm:p-8">
        <SkeletonBlock className="mb-8 h-7 w-48" />
        <div className="space-y-8">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-28 w-full" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-11 w-full" />
            </div>
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-11 w-full" />
            </div>
          </div>
        </div>
      </Panel>
      <Panel className="p-5 sm:p-8">
        <SkeletonBlock className="mb-6 h-7 w-40" />
        <ListRows count={2} height="h-16" />
      </Panel>
    </div>
  </div>
);

const EditorSkeleton = () => (
  <div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <SkeletonBlock className="h-9 w-60 max-w-[70vw]" />
        <SkeletonBlock className="h-4 w-44" />
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 w-28" />
        <SkeletonBlock className="h-10 w-32" />
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel className="min-h-128 p-4">
        <div className="mb-4 flex gap-2">
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-9 w-10" />
        </div>
        <SkeletonBlock className="h-96 w-full sm:h-120" />
      </Panel>
      <Panel className="p-5">
        <SkeletonBlock className="mb-6 h-6 w-36" />
        <div className="space-y-5">
          <ListRows count={2} height="h-10" />
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-11 w-full" />
        </div>
      </Panel>
    </div>
  </div>
);

const PageSkeleton = () => (
  <div className="mx-auto max-w-6xl">
    <div className="mb-8 space-y-3">
      <SkeletonBlock className="h-10 w-64 max-w-[75vw]" />
      <SkeletonBlock className="h-4 w-80 max-w-full" />
    </div>
    <Panel className="p-5 sm:p-8">
      <SkeletonBlock className="mb-7 h-7 w-48" />
      <div className="space-y-4">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-11/12" />
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="mt-8 h-40 w-full" />
      </div>
    </Panel>
  </div>
);

const skeletonByVariant = {
  account: AccountSkeleton,
  division: DivisionSkeleton,
  editor: EditorSkeleton,
  page: PageSkeleton,
  staff: StaffSkeleton,
};

export const LoadingSkeleton = ({ label = 'Loading…', variant = 'page', compact = false }) => {
  if (compact) {
    return (
      <output
        className="loading-skeleton-enter block min-h-64 w-full py-6"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">{label}</span>
        <div className="space-y-4" aria-hidden="true">
          <SkeletonBlock className="h-6 w-44 max-w-[60vw]" />
          <ListRows count={3} height="h-14" />
        </div>
      </output>
    );
  }

  const Skeleton = skeletonByVariant[variant] ?? PageSkeleton;
  const spacingClass =
    variant === 'account' ? 'pt-40' : variant === 'division' ? 'pt-32 md:pt-40' : 'pt-32';

  return (
    <output
      className={`loading-skeleton-enter block min-h-dvh w-full bg-zinc-950 pb-20 ${spacingClass}`}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        <Skeleton />
      </div>
    </output>
  );
};

LoadingSkeleton.propTypes = {
  compact: PropTypes.bool,
  label: PropTypes.string,
  variant: PropTypes.oneOf(['account', 'division', 'editor', 'page', 'staff']),
};
