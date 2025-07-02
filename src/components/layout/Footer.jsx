import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

export const Footer = () => {
  const [statusColor, setStatusColor] = useState('bg-gray-400'); // Default gray

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Fetch health status from the API endpoint
        const response = await fetch('https://v2.stopbars.com/health');
        const data = await response.json();
        
        // Extract all service status values from the response object
        // Expected format: { "database": "ok", "storage": "ok", "vatsim": "ok", "auth": "ok", "stats": "ok" }
        const services = Object.values(data);
        const okCount = services.filter(status => status === 'ok').length;
        const totalCount = services.length;
        
        // Determine status indicator color based on service health:
        if (okCount === totalCount) {
          // All services are "ok" (5/5 ok, 0/5 outage) - show green
          setStatusColor('bg-green-400');
        } else if (okCount === 0) {
          // All services are "outage" (5/5 outage) - show red
          setStatusColor('bg-red-400');
        } else {
          // Mixed status - even just 1 service "outage" triggers orange
          setStatusColor('bg-orange-400');
        }
      } catch (error) {
        // Invalid response from /health endpoint - show gray
        console.error('Failed to fetch status:', error);
        setStatusColor('bg-gray-400');
      }
    };

    fetchStatus();
    // Refresh every 5 minutes (300 seconds)
    const interval = setInterval(fetchStatus, 300000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="py-8 md:py-16 border-t border-zinc-900">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 lg:gap-16">
          {/* Branding Section */}
          <div className="col-span-1 lg:col-span-1">
            <h4 className="text-3xl md:text-3xl font-bold mb-4 md:mb-6">BARS</h4>
            <div className="text-base md:text-base text-zinc-400 mb-4 md:mb-6">© Copyright {new Date().getFullYear()} BARS</div>
            <div className="flex items-center space-x-5 md:space-x-5">
              <a
                href="https://discord.gg/7EhmtwKWzs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <img src="https://cdn.prod.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" alt="Discord Logo" className="w-7 h-6 md:w-8 md:h-6" />
              </a>
              <a
                href="https://github.com/stopbars"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <img src="/GitHub.svg" alt="GitHub Logo" className="w-7 h-7 md:w-8 md:h-8" />
              </a>
              <a
                href="https://opencollective.com/stopbars"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <img src="https://avatars.githubusercontent.com/u/13403593" alt="Open Collective Logo" className="w-7 h-7 md:w-8 md:h-8" />
              </a>
            </div>
          </div>

          {/* Resources Section */}
          <div className="col-span-1">
            <h4 className="text-base md:text-base font-medium mb-4 md:mb-6">Resources</h4>
            <ul className="space-y-3 md:space-y-3">
              <li>
                <Link to="/about" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link to="/changelog" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  Changelog
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Section */}
          <div className="col-span-1">
            <h4 className="text-base md:text-base font-medium mb-4 md:mb-6">Support</h4>
            <ul className="space-y-3 md:space-y-3">
              <li>
                <a 
                  href="https://status.stopbars.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-base md:text-base text-zinc-400 hover:text-white flex items-center space-x-2 transition-colors"
                >
                  <span>Status</span>
                  <div className="relative mt-0.5">
                    <div className={`w-2.5 h-2.5 md:w-2.5 md:h-2.5 rounded-full ${statusColor} transition-colors duration-300 shadow-lg`}></div>
                    <div 
                      className={`absolute inset-0 w-2.5 h-2.5 md:w-2.5 md:h-2.5 rounded-full ${statusColor} animate-pulse opacity-50`}
                      style={{ animationDuration: '3s' }}
                    ></div>
                    <div 
                      className={`absolute -inset-0.5 w-3.5 h-3.5 md:w-3.5 md:h-3.5 rounded-full ${statusColor} animate-ping opacity-20`}
                      style={{ animationDuration: '3s' }}
                    ></div>
                  </div>
                </a>
              </li>
              <li>
                <Link to="/contact" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/documentation" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  Documentation
                </Link>
              </li>
            </ul>
          </div>

          {/* Organization Section */}
          <div className="col-span-1">
            <h4 className="text-base md:text-base font-medium mb-4 md:mb-6">Organization</h4>
            <ul className="space-y-3 md:space-y-3">
              <li>
                <Link to="/divisions" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  Divisions
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-base md:text-base text-zinc-400 hover:text-white transition-colors">
                  Terms Of Use
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 md:mt-16 pt-6 md:pt-8 border-t border-zinc-900">
          <p className="text-zinc-500 hover:text-red-400/90 transition-colors duration-300 text-base md:text-base text-center max-w-4xl mx-auto leading-relaxed">
            BARS is an independent third-party software project. We are not affiliated with, endorsed by, or connected to
            VATSIM, vatSys, EuroScope, Microsoft Flight Simulator, or any other simulation, controller client supported by our software.
          </p>
        </div>
      </div>
    </footer>
  );
};