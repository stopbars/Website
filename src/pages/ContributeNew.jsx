import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { AlertCircle, Search, Loader, BookOpen, ChevronRight } from 'lucide-react';

const ContributeNew = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [icao, setIcao] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Check for error parameter on mount
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'airport_load_failed') {
      setShowToast(true);
      // Clear the error parameter from URL
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!icao) {
      setError('Please enter an airport ICAO code');
      return;
    }

    if (!/^[A-Za-z0-9]{4}$/.test(icao)) {
      setError('ICAO code must be exactly 4 characters (letters and numbers only)');
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Navigate to the map view with the ICAO code
      navigate(`/contribute/map/${icao.toUpperCase()}`);
    } catch (err) {
      setError('Failed to verify airport. Please try again.');
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20 flex items-center">
        <div className="w-full max-w-3xl mx-auto px-6">
          <div className="mb-12 text-center">
            <h1 className="text-3xl font-bold mb-4">Contribute to BARS</h1>
            <p className="text-zinc-400 max-w-xl mx-auto"></p>
          </div>

          <Card className="p-8 max-w-lg mx-auto">
            <h2 className="text-xl font-medium mb-6">Step 1: Select Airport</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="icao" className="block text-sm font-medium mb-2">
                  Enter Airport ICAO Code
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                  <input
                    id="icao"
                    type="text"
                    value={icao}
                    onChange={(e) => {
                      setIcao(e.target.value.toUpperCase());
                      setError('');
                    }}
                    placeholder="e.g. YSSY, EGLL, OMDB"
                    maxLength={4}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-lg uppercase"
                  />
                </div>
                {error && (
                  <div className="mt-2 flex items-center text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div>
                <Button type="submit" className="w-full" disabled={isSearching}>
                  {isSearching ? (
                    <div className="flex items-center justify-center">
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      <span>Searching...</span>
                    </div>
                  ) : (
                    <>
                      Continue to Next Step
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            <div className="mt-8 pt-6 border-t border-zinc-800">
              <Button
                variant="outline"
                onClick={() => window.navigate('/contribute/guide')}
                className="flex items-center justify-center w-full"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                View Contribution Guide
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Toast for error messages */}
      <Toast
        title="Error Loading Airport"
        description="Failed to load airport data, please try again."
        variant="destructive"
        show={showToast}
        onClose={() => setShowToast(false)}
      />
    </Layout>
  );
};

export default ContributeNew;
