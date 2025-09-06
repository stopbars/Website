import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { AlertOctagon, LogOut, Mail, Clock} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { formatLocalDateTime } from '../utils/dateUtils';

const Banned = () => {
  const navigate = useNavigate();
  const { bannedInfo, logout, loading } = useAuth();

  // If the user visits this URL but isn't banned, send them home to avoid confusion
  useEffect(() => {
    if (!loading && !bannedInfo?.banned) {
      navigate('/', { replace: true });
    }
  }, [loading, bannedInfo?.banned, navigate]);

  const expiresText = bannedInfo?.expires_at
    ? `Until ${formatLocalDateTime(bannedInfo.expires_at)}`
    : 'This ban is permanent.';

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center pt-32 pb-16">
        <Card className="max-w-2xl w-full p-10 border border-zinc-800 hover:border-zinc-700 transition-colors bg-zinc-950/60">
          <div className="flex items-center gap-3 mb-4">
            <AlertOctagon className="w-6 h-6 text-red-500" />
            <h1 className="text-2xl font-semibold">Account Banned</h1>
          </div>
          <p className="text-zinc-400 mb-6">Access to BARS is restricted for this account.</p>

          {bannedInfo?.reason && (
            <div className="rounded-lg border border-zinc-800 overflow-hidden mb-5">
              <div className="h-1 w-full bg-red-500/40" />
              <div className="p-4 bg-zinc-900/50">
                <p className="text-zinc-300"><span className="text-zinc-400">Reason:</span> <span className="text-zinc-200">{bannedInfo.reason}</span></p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-zinc-500 mb-8">
            <Clock className="w-4 h-4" />
            <span className="text-sm">{expiresText}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={logout}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign out
            </Button>
            <Button
              variant="outline"
              onClick={() => (window.location.href = '/contact')}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              <Mail className="w-4 h-4 mr-2" /> Contact Support
            </Button>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Banned;
