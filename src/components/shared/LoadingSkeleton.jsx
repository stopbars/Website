import PropTypes from 'prop-types';

const SkeletonBlock = ({ className = '' }) => (
  <span aria-hidden="true" className={`loading-skeleton-block block ${className}`} />
);

SkeletonBlock.propTypes = {
  className: PropTypes.string,
};

const Panel = ({ children, className = '' }) => (
  <div className={`rounded-xl border border-zinc-800/70 bg-zinc-900 ${className}`}>{children}</div>
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

const PageHeading = ({ centered = false, wide = false }) => (
  <div className={`${centered ? 'mx-auto items-center text-center' : ''} flex flex-col gap-3`}>
    <SkeletonBlock className={`h-9 ${wide ? 'w-80' : 'w-56'} max-w-[75vw]`} />
    <SkeletonBlock className="h-4 w-72 max-w-[65vw]" />
  </div>
);

PageHeading.propTypes = {
  centered: PropTypes.bool,
  wide: PropTypes.bool,
};

const CardGrid = ({ count = 6, className = '', cardClassName = 'h-40' }) => (
  <div className={`grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 ${className}`}>
    {Array.from({ length: count }, (_, index) => (
      <Panel key={index} className="p-5">
        <div className={cardClassName}>
          <div className="flex items-start gap-3">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-5 w-28" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        </div>
      </Panel>
    ))}
  </div>
);

CardGrid.propTypes = {
  cardClassName: PropTypes.string,
  className: PropTypes.string,
  count: PropTypes.number,
};

const FlowHeaderSkeleton = () => (
  <header className="mb-8 mt-6">
    <div className="sm:hidden">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="h-3 w-16" />
      </div>
      <SkeletonBlock className="mt-3 h-1 w-full" />
    </div>
    <div className="hidden h-12 items-center sm:flex">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center">
          <SkeletonBlock className="h-6 w-6 rounded-full" />
          <SkeletonBlock className="ml-2 h-3 w-14" />
          {index < 5 ? <SkeletonBlock className="mx-3 h-px w-5" /> : null}
        </div>
      ))}
    </div>
    <div className="mt-5 space-y-3">
      <SkeletonBlock className="h-9 w-64 max-w-[75vw]" />
      <SkeletonBlock className="h-4 w-56 max-w-[65vw]" />
    </div>
  </header>
);

const StaffSkeleton = () => (
  <div className="mx-auto max-w-450 px-6 2xl:px-12">
    <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <PageHeading />
      <SkeletonBlock className="h-12 w-40" />
    </div>
    <SkeletonBlock className="mb-4 h-11 w-full md:hidden" />
    <div className="grid grid-cols-12 items-start gap-5">
      <Panel className="hidden p-3 md:col-span-3 md:block">
        <ListRows count={9} height="h-10" />
      </Panel>
      <Panel className="col-span-12 min-h-150 p-5 sm:p-6 md:col-span-9">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-7 w-52" />
            <SkeletonBlock className="h-4 w-72 max-w-full" />
          </div>
          <SkeletonBlock className="h-10 w-36" />
        </div>
        <SkeletonBlock className="mb-5 h-11 w-full" />
        <ListRows count={6} height="h-16" />
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
        <div key={index} className="rounded-lg border border-zinc-800/70 bg-zinc-950/35 p-4">
          <div className="flex items-start gap-3">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-5 w-32 max-w-full" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
            <SkeletonBlock className="h-8 w-8" />
          </div>
          <SkeletonBlock className="mt-6 h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  </Panel>
);

DivisionCardSkeleton.propTypes = {
  rows: PropTypes.number,
};

const DivisionSkeleton = () => (
  <div className="mx-auto max-w-6xl px-4">
    <div className="mb-6">
      <PageHeading />
    </div>
    <div className="space-y-6">
      <DivisionCardSkeleton />
      <DivisionCardSkeleton />
    </div>
  </div>
);

const AccountSkeleton = () => (
  <div className="mx-auto max-w-5xl px-6">
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
        <SkeletonBlock className="h-4 w-24" />
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/35 p-4">
          <SkeletonBlock className="h-5 w-3/4" />
          <div className="mt-4 flex gap-3">
            <SkeletonBlock className="h-9 w-24" />
            <SkeletonBlock className="h-9 w-32" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
      </Panel>
      <Panel className="p-5 sm:p-8">
        <SkeletonBlock className="mb-6 h-7 w-40" />
        <ListRows count={2} height="h-16" />
      </Panel>
    </div>
  </div>
);

const ContributionDashboardSkeleton = () => (
  <div className="mx-auto max-w-7xl px-4 sm:px-6">
    <div className="mb-8 flex flex-col gap-6 sm:mb-12 sm:flex-row sm:items-center sm:justify-between">
      <PageHeading wide />
      <SkeletonBlock className="h-10 w-56" />
    </div>
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <Panel className="order-2 min-h-80 p-5 lg:order-1">
        <SkeletonBlock className="mb-6 h-7 w-44" />
        <ListRows count={4} height="h-13" />
      </Panel>
      <div className="order-1 min-h-150 lg:order-2 lg:col-span-2">
        <SkeletonBlock className="mb-6 h-10 w-full rounded-none" />
        <SkeletonBlock className="mb-6 h-10 w-full" />
        <ListRows count={3} height="h-36" />
      </div>
    </div>
  </div>
);

const ContributionFormSkeleton = () => (
  <div className="mx-auto max-w-4xl px-6">
    <FlowHeaderSkeleton />
    <Panel className="mx-auto max-w-xl p-6 sm:p-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-3 w-36" />
        </div>
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="mx-auto h-10 w-48" />
      </div>
    </Panel>
  </div>
);

const MapPanel = ({ height = 'h-150' }) => (
  <div className={`overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 ${height}`}>
    <div className="flex h-full items-start justify-end p-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-9 w-9" />
        <SkeletonBlock className="h-9 w-9" />
      </div>
    </div>
  </div>
);

MapPanel.propTypes = {
  height: PropTypes.string,
};

const ContributionMapSkeleton = () => (
  <div className="mx-auto max-w-7xl px-6">
    <FlowHeaderSkeleton />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <MapPanel />
      </div>
      <div className="space-y-6">
        <Panel className="p-6">
          <SkeletonBlock className="mb-5 h-6 w-36" />
          <ListRows count={3} height="h-10" />
        </Panel>
        <Panel className="p-6">
          <SkeletonBlock className="mb-4 h-5 w-32" />
          <SkeletonBlock className="h-24 w-full" />
        </Panel>
      </div>
    </div>
  </div>
);

const GeneratorSkeleton = () => (
  <div className="mx-auto max-w-7xl px-6">
    <FlowHeaderSkeleton />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <MapPanel height="h-[34rem] lg:h-[calc(100vh-15rem)]" />
      <Panel className="p-5">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-10 w-10" />
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        </div>
        <SkeletonBlock className="mt-4 h-36 w-full" />
        <SkeletonBlock className="mt-5 h-11 w-full" />
      </Panel>
    </div>
  </div>
);

const ContributionTestSkeleton = () => (
  <div className="mx-auto max-w-7xl px-6">
    <FlowHeaderSkeleton />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Panel className="p-6 lg:col-span-2">
        <SkeletonBlock className="mb-4 h-6 w-24" />
        <SkeletonBlock className="h-125 w-full" />
      </Panel>
      <Panel className="p-6">
        <SkeletonBlock className="mb-4 h-6 w-44" />
        <SkeletonBlock className="h-52 w-full" />
        <SkeletonBlock className="mt-4 h-11 w-full" />
      </Panel>
    </div>
  </div>
);

const ContributionDetailsSkeleton = () => (
  <div className="mx-auto max-w-4xl px-6">
    <FlowHeaderSkeleton />
    <Panel className="p-6 sm:p-8">
      <SkeletonBlock className="mb-8 h-7 w-32" />
      <div className="space-y-8">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-11 w-full" />
        </div>
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-24" />
          <div className="grid gap-3 sm:grid-cols-3">
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-12 w-full" />
          </div>
        </div>
        <SkeletonBlock className="h-32 w-full" />
        <SkeletonBlock className="h-11 w-full" />
      </div>
    </Panel>
  </div>
);

const FullScreenEditorSkeleton = () => (
  <div className="flex h-dvh min-h-0 flex-col bg-zinc-950">
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-3 sm:px-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-8 w-8" />
        <SkeletonBlock className="h-5 w-36" />
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-8 w-24" />
        <SkeletonBlock className="h-8 w-28" />
      </div>
    </div>
    <div className="flex min-h-0 flex-1">
      <div className="hidden w-64 shrink-0 border-r border-zinc-800 p-3 lg:block">
        <SkeletonBlock className="mb-4 h-9 w-full" />
        <ListRows count={7} height="h-11" />
      </div>
      <div className="relative min-w-0 flex-1 bg-zinc-900/70">
        <div className="absolute left-3 top-3 flex gap-2">
          <SkeletonBlock className="h-9 w-9" />
          <SkeletonBlock className="h-9 w-9" />
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex justify-between">
          <SkeletonBlock className="h-9 w-40" />
          <SkeletonBlock className="h-9 w-32" />
        </div>
      </div>
      <div className="hidden w-80 shrink-0 border-l border-zinc-800 p-4 xl:block">
        <SkeletonBlock className="mb-6 h-6 w-36" />
        <ListRows count={5} height="h-12" />
      </div>
    </div>
  </div>
);

const AirportEditorSkeleton = () => (
  <div className="px-4 py-6 pt-12 lg:px-8 lg:pt-16">
    <div className="mb-6 flex items-start justify-between gap-4">
      <PageHeading />
      <SkeletonBlock className="mt-2 h-10 w-40" />
    </div>
    <div className="flex flex-col gap-6 lg:h-[calc(100vh-15rem)] lg:flex-row">
      <MapPanel height="h-[70vh] min-h-72 lg:h-auto lg:flex-1" />
      <Panel className="min-h-80 p-5 lg:w-96">
        <SkeletonBlock className="mb-6 h-7 w-40" />
        <ListRows count={5} height="h-12" />
      </Panel>
    </div>
  </div>
);

const StatusContentSkeleton = () => <CardGrid />;

const StatusSkeleton = () => (
  <div className="mx-auto max-w-7xl px-6">
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <PageHeading wide />
      <div className="flex gap-4">
        <SkeletonBlock className="h-10 w-10" />
        <SkeletonBlock className="h-10 w-10" />
        <SkeletonBlock className="h-10 w-10" />
      </div>
    </div>
    <div className="mb-8 flex flex-col gap-3 lg:flex-row">
      <SkeletonBlock className="h-12 flex-1" />
      <div className="flex gap-3">
        <SkeletonBlock className="h-12 w-48" />
        <SkeletonBlock className="h-12 w-48" />
      </div>
    </div>
    <StatusContentSkeleton />
  </div>
);

const ChangelogContentSkeleton = () => (
  <div className="space-y-12 md:ml-48">
    {Array.from({ length: 3 }, (_, index) => (
      <div key={index} className="relative">
        <div className="hidden md:block absolute -left-48 top-0">
          <SkeletonBlock className="h-4 w-28" />
        </div>
        <SkeletonBlock className="mb-4 h-7 w-44" />
        <Panel className="p-6">
          <ListRows count={index === 0 ? 5 : 3} height="h-4" />
        </Panel>
      </div>
    ))}
  </div>
);

const ChangelogSkeleton = () => (
  <div className="mx-auto max-w-5xl px-6">
    <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <SkeletonBlock className="h-10 w-48" />
      <SkeletonBlock className="h-11 w-full sm:w-56" />
    </div>
    <SkeletonBlock className="mb-12 h-px w-full rounded-none" />
    <ChangelogContentSkeleton />
  </div>
);

const FaqListSkeleton = () => (
  <div className="space-y-4">
    {Array.from({ length: 5 }, (_, index) => (
      <Panel key={index} className="flex min-h-14 items-center justify-between px-6 py-4">
        <SkeletonBlock className={`h-5 ${index % 2 === 0 ? 'w-3/5' : 'w-4/5'}`} />
        <SkeletonBlock className="h-5 w-5 shrink-0" />
      </Panel>
    ))}
  </div>
);

const ToolListSkeleton = () => (
  <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="h-4 w-64 max-w-full" />
      </div>
      <SkeletonBlock className="h-9 w-32" />
    </div>
    <SkeletonBlock className="h-10 w-full sm:w-64" />
    <ListRows count={5} height="h-20" />
  </div>
);

const ToolCardGridSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: 6 }, (_, index) => (
      <Panel key={index} className="min-h-80 p-5">
        <div className="flex items-start gap-3">
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
          <SkeletonBlock className="h-8 w-8" />
        </div>
        <div className="mt-6 space-y-4">
          <ListRows count={3} height="h-4" />
          <SkeletonBlock className="h-9 w-full" />
        </div>
      </Panel>
    ))}
  </div>
);

const ToolStackSkeleton = () => <ListRows count={5} height="h-24" />;

const ToolDetailSkeleton = () => (
  <div className="space-y-4">
    <SkeletonBlock className="h-4 w-full" />
    <SkeletonBlock className="h-4 w-11/12" />
    <SkeletonBlock className="h-4 w-4/5" />
    <div className="flex gap-3 pt-3">
      <SkeletonBlock className="h-9 w-24" />
      <SkeletonBlock className="h-9 w-28" />
    </div>
  </div>
);

const FaqSkeleton = () => (
  <div className="mx-auto max-w-4xl px-6">
    <div className="mb-8">
      <PageHeading centered wide />
    </div>
    <SkeletonBlock className="mx-auto mb-12 h-12 w-full max-w-xl" />
    <FaqListSkeleton />
  </div>
);

const CreditsSkeleton = () => (
  <div className="mx-auto max-w-6xl px-6">
    <div className="mb-12 space-y-4">
      <SkeletonBlock className="h-12 w-80 max-w-[80vw]" />
      <SkeletonBlock className="h-5 w-full max-w-2xl" />
      <SkeletonBlock className="h-5 w-4/5 max-w-xl" />
    </div>
    <div className="mb-16 grid gap-6 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Panel key={index} className="p-6 text-center">
          <SkeletonBlock className="mx-auto mb-3 h-10 w-24" />
          <SkeletonBlock className="mx-auto h-5 w-32" />
        </Panel>
      ))}
    </div>
    <SkeletonBlock className="mx-auto mb-12 h-8 w-56" />
    <CardGrid count={8} className="xl:grid-cols-4" cardClassName="h-48" />
  </div>
);

const LegalSkeleton = () => (
  <div className="mx-auto max-w-4xl px-6">
    <PageHeading />
    <div className="mt-10 space-y-10">
      {Array.from({ length: 4 }, (_, index) => (
        <section key={index} className="space-y-4">
          <SkeletonBlock className="h-7 w-48" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-11/12" />
          <SkeletonBlock className="h-4 w-4/5" />
        </section>
      ))}
    </div>
  </div>
);

const FormPageSkeleton = () => (
  <div className="mx-auto max-w-5xl px-6">
    <div className="mb-10">
      <PageHeading centered wide />
    </div>
    <Panel className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonBlock className="h-11 w-full" />
      </div>
    </Panel>
  </div>
);

const PageSkeleton = () => (
  <div className="mx-auto max-w-6xl px-6">
    <div className="mb-8">
      <PageHeading wide />
    </div>
    <Panel className="p-6 sm:p-8">
      <SkeletonBlock className="mb-7 h-7 w-48" />
      <ListRows count={5} height="h-4" />
      <SkeletonBlock className="mt-8 h-48 w-full" />
    </Panel>
  </div>
);

const skeletonByVariant = {
  account: AccountSkeleton,
  'airport-editor': AirportEditorSkeleton,
  changelog: ChangelogSkeleton,
  contributions: ContributionDashboardSkeleton,
  credits: CreditsSkeleton,
  division: DivisionSkeleton,
  faq: FaqSkeleton,
  'flow-details': ContributionDetailsSkeleton,
  'flow-form': ContributionFormSkeleton,
  'flow-generator': GeneratorSkeleton,
  'flow-map': ContributionMapSkeleton,
  'flow-test': ContributionTestSkeleton,
  'form-page': FormPageSkeleton,
  'full-editor': FullScreenEditorSkeleton,
  legal: LegalSkeleton,
  page: PageSkeleton,
  staff: StaffSkeleton,
  status: StatusSkeleton,
};

const compactSkeletonByVariant = {
  'airport-list': StatusContentSkeleton,
  'changelog-content': ChangelogContentSkeleton,
  'faq-list': FaqListSkeleton,
  'status-content': StatusContentSkeleton,
  'tool-card-grid': ToolCardGridSkeleton,
  'tool-detail': ToolDetailSkeleton,
  'tool-list': ToolListSkeleton,
  'tool-stack': ToolStackSkeleton,
};

const variantSpacing = {
  account: 'pt-40',
  'airport-editor': 'pt-20',
  changelog: 'pt-38 md:pt-40',
  contributions: 'pt-32 sm:pt-39',
  credits: 'pt-39',
  division: 'pt-32 md:pt-40',
  faq: 'pt-40',
  'flow-details': 'pt-32',
  'flow-form': 'pt-32',
  'flow-generator': 'pt-32',
  'flow-map': 'pt-32',
  'flow-test': 'pt-32',
  'form-page': 'pt-40',
  legal: 'pt-40',
  page: 'pt-32',
  staff: 'pt-28 sm:pt-32',
  status: 'pt-40',
};

const loadingSkeletonVariants = [
  'account',
  'airport-editor',
  'airport-list',
  'changelog',
  'changelog-content',
  'contributions',
  'credits',
  'division',
  'faq',
  'faq-list',
  'flow-details',
  'flow-form',
  'flow-generator',
  'flow-map',
  'flow-test',
  'form-page',
  'full-editor',
  'legal',
  'page',
  'staff',
  'status',
  'status-content',
  'tool-card-grid',
  'tool-detail',
  'tool-list',
  'tool-stack',
];

export const LoadingSkeleton = ({ label = 'Loading…', variant = 'page', compact = false }) => {
  const isFullScreen = variant === 'full-editor';
  const Skeleton = compact
    ? (compactSkeletonByVariant[variant] ?? PageSkeleton)
    : (skeletonByVariant[variant] ?? PageSkeleton);

  if (compact) {
    return (
      <output
        className="loading-skeleton-enter block w-full py-2"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">{label}</span>
        <div aria-hidden="true">
          <Skeleton />
        </div>
      </output>
    );
  }

  return (
    <output
      className={`loading-skeleton-enter block w-full bg-zinc-950 ${
        isFullScreen
          ? 'h-dvh overflow-hidden'
          : `min-h-dvh pb-20 ${variantSpacing[variant] ?? 'pt-32'}`
      }`}
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
  variant: PropTypes.oneOf(loadingSkeletonVariants),
};
