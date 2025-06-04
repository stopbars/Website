import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import ComingSoon from './ComingSoon';

const MaintenanceWrapper = ({ children }) => {
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(true);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check if maintenance mode is disabled
        const maintenanceDisabled = localStorage.getItem('bars-maintenance-mode') === 'false';
        setIsMaintenanceMode(!maintenanceDisabled);
        setIsLoading(false);
    }, []);

    if (isLoading) {
        // Simple loading state
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 flex items-center justify-center">
                <div className="text-white text-xl">Loading...</div>
            </div>
        );
    }

    if (isMaintenanceMode) {
        return <ComingSoon />;
    }
    return children;
};

MaintenanceWrapper.propTypes = {
    children: PropTypes.node.isRequired
};

export default MaintenanceWrapper;
