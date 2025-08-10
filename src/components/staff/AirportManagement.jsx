import { useState } from 'react';
import { Card } from '../shared/Card';
import PendingAirportRequests from '../divisions/PendingAirportRequests';

const AirportManagement = () => {
  const [pendingCount, setPendingCount] = useState(0);

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">Airport Management</h1>
        <div className="text-sm bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full">
          {pendingCount || '0'} Pending Requests
        </div>
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <PendingAirportRequests onCountChange={setPendingCount} />
        </Card>
      </div>
    </div>
  );
};

export default AirportManagement;
