import PropTypes from 'prop-types';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

export function LoadErrorCard({ title, message, onRetry }) {
  return (
    <Card className="border-red-500/20 bg-red-500/5 p-6 sm:p-8" role="alert">
      <div className="flex items-start gap-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{message}</p>
          <Button variant="outline" className="mt-5 px-4 py-2.5" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </Card>
  );
}

LoadErrorCard.propTypes = {
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  onRetry: PropTypes.func.isRequired,
};
