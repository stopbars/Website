import { Card } from '../shared/Card';
import PendingAirportRequests from '../divisions/PendingAirportRequests';
import { TowerControl } from 'lucide-react';

const AirportManagement = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <TowerControl className="w-6 h-6 text-zinc-400" />
        <h2 className="text-2xl font-semibold text-white">Airport Management</h2>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          Pending Airport Requests:
        </h3>
        <Card className="p-6">
          <PendingAirportRequests />
        </Card>
      </div>
    </div>
  );
};

export default AirportManagement;
