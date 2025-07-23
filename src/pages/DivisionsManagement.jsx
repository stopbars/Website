import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Plus, FileCheck2 } from 'lucide-react';
import PendingAirportRequests from '../components/divisions/PendingAirportRequests';
import { getVatsimToken } from '../utils/cookieUtils';

const DivisionsManagement = () => {
  const [userDivisions, setUserDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = getVatsimToken();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch user's divisions
        const userDivisionsResponse = await fetch('https://v2.stopbars.com/divisions/user', {
          headers: {
            'X-Vatsim-Token': token
          }
        });
        
        if (!userDivisionsResponse.ok) throw new Error('Failed to fetch user divisions');
        const userDivisionsData = await userDivisionsResponse.json();
        setUserDivisions(userDivisionsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchData();
  }, [token]);

  const formatRole = (role) => {
    return role
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white mb-8">Loading...</h1>
        </div>
      </div>
    </Layout>
  );

  if (error) return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-8">
            <p className="text-red-500">{error}</p>
          </div>
        </div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Divisions</h1>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Your Divisions</h2>
            {userDivisions.length > 0 ? (
              userDivisions.map((userDiv) => {
                const division = userDiv.division ?? userDiv;
                const role = userDiv.role;
                
                return division && (
                  <Card key={division.id} className="mb-4 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center justify-between p-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{division.name}</h3>
                        <p className="text-zinc-400">Your Role: {formatRole(role)}</p>
                      </div>
                        <Button onClick={() => navigate(`/divisions/${division.id}/manage`)}>
                          Manage Division
                        </Button>
                    </div>
                  </Card>
                );
              })
            ) : (
              <p className="text-zinc-400">You are not a member of any divisions.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DivisionsManagement;