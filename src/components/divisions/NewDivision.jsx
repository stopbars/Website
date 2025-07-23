import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../layout/Layout';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { AlertTriangle } from 'lucide-react';

const NewDivision = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [headCid, setHeadCid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const token = localStorage.getItem('vatsimToken');

  const handleNameBlur = () => {
    if (name.toUpperCase().startsWith('VAT')) {
      // Auto-uppercase VAT (e.g., "vatpac, VatPac" -> "VATPAC")
      setName(name.toUpperCase());
    } else if (name.toLowerCase().includes('vacc')) {
      // Auto-format vACC (e.g., "Dutch vacc", "Dutch vAcC" -> "Dutch vACC")
      setName(name.replace(/vacc/gi, 'vACC'));
    }
    // Other names keep their original casing
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Handle special formatting for divisions and vACCs
    let formattedName = name;
    if (name.toUpperCase().startsWith('VAT')) {
      // Auto-uppercase VAT (e.g., "vatpac, VatPac" -> "VATPAC")
      formattedName = name.toUpperCase();
    }
    // vACC names keep their original casing to preserve "vACC" formatting

    try {
      const response = await fetch('https://v2.stopbars.com/divisions', {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formattedName,
          headVatsimId: headCid
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create division');
      }

      const division = await response.json();
      navigate(`/divisions/${division.id}/manage`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-8">Create Division</h1>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-8 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <p className="text-red-500">{error}</p>
              </div>
            )}

            <Card>
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-zinc-400 mb-2" htmlFor="name">
                    Division Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleNameBlur}
                    className="w-full bg-zinc-900 text-white rounded-lg px-4 py-2 border border-zinc-800"
                    placeholder="e.g. VATxxx, xxx vACC"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-2" htmlFor="headCid">
                    Nav Head CID
                  </label>
                  <input
                    id="headCid"
                    type="text"
                    value={headCid}
                    onChange={(e) => setHeadCid(e.target.value)}
                    className="w-full bg-zinc-900 text-white rounded-lg px-4 py-2 border border-zinc-800"
                    placeholder="VATSIM CID of Division Nav Head"
                    required
                  />
                  <p className="mt-2 text-sm text-zinc-500">
                    This person will be assigned as the Nav Head of the Division
                  </p>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/divisions')}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className={loading ? 'opacity-50 cursor-not-allowed' : ''}
                  >
                    {loading ? 'Creating...' : 'Create Division'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default NewDivision;