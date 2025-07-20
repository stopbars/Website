// DocsSidebar.jsx
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { BookOpen, Monitor, ChevronRight } from '../shared/Icons';

export const DocsSidebar = ({ currentDoc, onDocChange, content }) => {
  const [navigationItems, setNavigationItems] = useState([
    {
      id: 'pilot',
      label: 'Pilot Guide',
      icon: BookOpen,
      contents: []
    },
    {
      id: 'euroscope',
      label: 'EuroScope Guide',
      icon: Monitor,
      contents: []
    },
    {
      id: 'controller',
      label: 'vatSys Guide',
      icon: Monitor,
      contents: []
    },
  ]);

  useEffect(() => {
    if (!content) {
      console.log('No content received');
      return;
    }

    // Parse markdown content to extract headers
    const headers = [];
    const lines = content.split('\n');
    
    lines.forEach(line => {
      // Match headers (# Header 1, ## Header 2, etc)
      const headerMatch = line.match(/^(#{1,6})\s*(.+)/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();
        const id = title
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
        
        // Only include headers level 2 and deeper for the contents
        if (level >= 2) {
          headers.push({ level, title, id });
        }
      }
    });

    setNavigationItems(prev => 
      prev.map(item => 
        item.id === currentDoc 
          ? { ...item, contents: headers }
          : item
      )
    );
  }, [content, currentDoc]);

  const handleItemClick = (itemId) => {
    onDocChange(itemId);
  };

  const handleHeaderClick = (headerId) => {
    const element = document.getElementById(headerId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="w-64 flex-shrink-0">
      <nav className="sticky top-24">
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isExpanded = currentDoc === item.id;


            return (
              <div key={item.id}>
                <button
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer ${
                    isExpanded
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <ChevronRight 
                    className={`w-4 h-4 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`} 
                  />
                </button>
                {isExpanded && item.contents && item.contents.length > 0 && (
                  <div className="ml-6 mt-4 space-y-3">
                    {item.contents.map((header, index) => (
                      <button
                        key={index}
                        onClick={() => handleHeaderClick(header.id)}
                        className={`
                          w-full text-left py-1 text-sm cursor-pointer
                          transition-all duration-200
                          ${header.level === 2 
                            ? 'text-zinc-300 hover:text-white font-medium pl-4' 
                            : 'text-zinc-400 hover:text-zinc-300 pl-8 text-xs'
                          }
                        `}
                      >
                        {header.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

DocsSidebar.propTypes = {
  currentDoc: PropTypes.oneOf(['pilot', 'controller', 'euroscope']).isRequired,
  onDocChange: PropTypes.func.isRequired,
  content: PropTypes.string
};

export default DocsSidebar;