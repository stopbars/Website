import PropTypes from 'prop-types';
import { GraduationCap } from 'lucide-react';
import { Tooltip } from '../shared/Tooltip.jsx';

const CONTRIBUTION_GUIDE_URL = 'https://docs.stopbars.com/contributions';

export function ContributionGuideLink({ className = '', tooltipSide = 'top' }) {
  return (
    <Tooltip content="Open contribution guide" className={className} side={tooltipSide}>
      <a
        href={CONTRIBUTION_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open contribution guide"
        className="ml-px inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
      >
        <GraduationCap className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </a>
    </Tooltip>
  );
}

ContributionGuideLink.propTypes = {
  className: PropTypes.string,
  tooltipSide: PropTypes.oneOf(['top', 'bottom']),
};
