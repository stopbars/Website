import { Check, Copy, PenLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRevealGroup } from '../../hooks/useRevealGroup';
import { Button } from '../shared/Button';
import { IconSwap } from '../shared/IconSwap';

const DIVISION_EMAIL = 'contact@stopbars.com';

export const DivisionData = () => {
  const sectionRef = useRef(null);
  const resetTimerRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState('');
  useRevealGroup(sectionRef);

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    []
  );

  const copyContactEmail = async () => {
    try {
      await navigator.clipboard.writeText(DIVISION_EMAIL);
      setCopyStatus('Email copied');
    } catch {
      setCopyStatus(`Could not copy. Email ${DIVISION_EMAIL}`);
    }

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopyStatus(''), 3000);
  };

  return (
    <section ref={sectionRef} className="deferred-section home-section" id="division-data">
      <div className="home-shell">
        <div
          data-reveal
          className="home-panel mx-auto max-w-4xl px-6 py-10 text-center sm:px-12 sm:py-14"
        >
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-zinc-800 text-zinc-200">
            <PenLine className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </div>

          <h2 className="home-section-title">Division Data</h2>
          <div className="mx-auto mt-4 max-w-2xl space-y-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
            <p>
              Divisions have full control over BARS object data for airports in their jurisdiction.
              Manage your airports&apos; lighting directly in BARS, keep facility data accurate, and
              use community scenery contributions to extend compatibility.
            </p>
            <p>
              To get started, email us from your division&apos;s domain with the CIDs that need
              access. We&apos;ll get your team onboarded.
            </p>
          </div>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button className="w-full sm:w-auto" onClick={copyContactEmail}>
              <IconSwap active={copyStatus === 'Email copied'}>
                <Copy className="h-4 w-4" />
                <Check className="h-4 w-4" />
              </IconSwap>
              Contact
            </Button>
            <a
              href="/discord"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-transparent bg-zinc-700 px-6 py-3 text-center font-medium text-white transition-[background-color,border-color,color,transform,opacity] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] hover:bg-zinc-600 active:scale-[0.96] active:bg-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:w-auto"
            >
              Discord
            </a>
          </div>
          <p className="mt-3 min-h-5 text-sm text-zinc-400" role="status" aria-live="polite">
            {copyStatus}
          </p>
        </div>
      </div>
    </section>
  );
};
