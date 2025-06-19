import { useState, useEffect } from 'react';
import { Loader, Search, Plane, Clock } from 'lucide-react';
import { Card } from '../shared/Card';

const AirportList = () => {
    const [airports, setAirports] = useState({ approved: {}, pending: {} });
    const [summary, setSummary] = useState({ total: 0, approved: 0, pending: 0, uniqueAirports: 0 });
    const [loading, setLoading] = useState(true);
    const [, setError] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchAirports();
    }, []);

    const fetchAirports = async () => {
        try {
            const response = await fetch('https://api.stopbars.com/airports/list');
            if (!response.ok) throw new Error('Failed to fetch airports');
            
            const data = await response.json();
            setAirports(data.airports);
            setSummary(data.summary);
        } catch (err) {
            setError('Failed to load airports');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const filteredAirports = {
        approved: Object.entries(airports.approved)
            .filter(([icao]) => icao.includes(search.toUpperCase()))
            .reduce((acc, [icao, scenery]) => ({ ...acc, [icao]: scenery }), {}),
        pending: Object.entries(airports.pending)
            .filter(([icao]) => icao.includes(search.toUpperCase()))
            .reduce((acc, [icao, scenery]) => ({ ...acc, [icao]: scenery }), {})
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="text-sm text-zinc-400">Total Submissions</div>
                    <div className="text-2xl font-bold">{summary.total}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-zinc-400">Unique Airports</div>
                    <div className="text-2xl font-bold">{summary.uniqueAirports}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-emerald-400">Approved</div>
                    <div className="text-2xl font-bold">{summary.approved}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-amber-400">Pending</div>
                    <div className="text-2xl font-bold">{summary.pending}</div>
                </Card>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Search airports by ICAO..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all"
                />
            </div>

            {/* Airport Lists */}
            <div className="grid grid-cols-2 gap-6">
                {/* Approved Airports */}
                <Card className="p-6">
                    <h3 className="text-lg font-medium mb-4 flex items-center">
                        <Plane className="w-5 h-5 mr-2 text-emerald-400" />
                        Approved Airports
                    </h3>
                    <div className="h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-800">
                        <div className="space-y-4">
                            {Object.entries(filteredAirports.approved).map(([icao, sceneryList]) => (
                                <div key={icao} className="p-4 bg-zinc-800/50 rounded-lg">
                                    <div className="font-medium mb-2">{icao}</div>
                                    <div className="space-y-1">
                                        {sceneryList.map((scenery, index) => (
                                            <div key={index} className="text-sm text-zinc-400">
                                                {scenery}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>

                {/* Pending Airports */}
                <Card className="p-6">
                    <h3 className="text-lg font-medium mb-4 flex items-center">
                        <Clock className="w-5 h-5 mr-2 text-amber-400" />
                        Pending Airports
                    </h3>
                    <div className="h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-800">
                        <div className="space-y-4">
                            {Object.entries(filteredAirports.pending).map(([icao, sceneryList]) => (
                                <div key={icao} className="p-4 bg-zinc-800/50 rounded-lg">
                                    <div className="font-medium mb-2">{icao}</div>
                                    <div className="space-y-1">
                                        {sceneryList.map((scenery, index) => (
                                            <div key={index} className="text-sm text-zinc-400">
                                                {scenery}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default AirportList;