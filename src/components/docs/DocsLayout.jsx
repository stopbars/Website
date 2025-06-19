import PropTypes from 'prop-types';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '../shared/Button';

export const DocsLayout = ({ children }) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  return (
    <div className="min-h-screen bg-zinc-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row py-8 lg:py-12 gap-8">
          
          {/* Mobile Sidebar Toggle */}
          <div className="lg:hidden flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">Documentation</h1>
            <Button 
              variant="outline" 
              className="p-2"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            >
              {mobileSidebarOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
              <span className="sr-only">Toggle sidebar</span>
            </Button>
          </div>

          {/* Mobile Sidebar */}
          <div className={`lg:hidden ${mobileSidebarOpen ? 'block' : 'hidden'} mb-6 bg-zinc-900/95 rounded-lg border border-zinc-800 p-4`}>
            {children[0]}
          </div>

          {/* Desktop Sidebar */}
          <div className="hidden lg:block">
            {children[0]}
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {children[1]}
          </div>
        </div>
      </div>
    </div>
  );
};

DocsLayout.propTypes = {
  children: PropTypes.node.isRequired
};