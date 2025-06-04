import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer className="py-8 md:py-16 border-t border-zinc-900 relative">
      {/* Hidden Kai Easter Egg */}
      <div className="absolute bottom-0 left-0 w-16 h-16 opacity-0 hover:opacity-100 transition-opacity duration-300">
        <img src="/Kai.png" alt="Kai Easter Egg" />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-16">
          {/* Branding Section */}
          <div className="col-span-1">
            <h4 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">BARS</h4>
            <div className="text-base text-zinc-400 mb-4 md:mb-6">© Copyright 2025 BARS</div>
            <div className="flex items-center space-x-5">
              <a 
                href="https://discord.gg/7EhmtwKWzs" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white"
              >
                <img src="https://cdn.prod.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" alt="Discord Logo" className="w-8 h-6" />
              </a>
              <a 
                href="https://www.youtube.com/@AussieScorcher" 
                className="text-zinc-400 hover:text-white"
              >
                <img src="https://cdn.worldvectorlogo.com/logos/youtube-icon-5.svg" alt="YouTube Logo" className="w-8 h-8" />
              </a>
            </div>
          </div>

          {/* Resources Section */}
          <div className="col-span-1">
            <h4 className="text-base font-medium mb-4 md:mb-6">Resources</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/about" className="text-zinc-400 hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link to="/changelog" className="text-zinc-400 hover:text-white">
                  Changelog
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-zinc-400 hover:text-white">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Section */}
          <div className="col-span-1">
            <h4 className="text-base font-medium mb-4 md:mb-6">Support</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/documentation" className="text-zinc-400 hover:text-white">
                  Documentation
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-zinc-400 hover:text-white">
                  Contact us
                </Link>
              </li>
              <li>
                <Link to="/discord" className="text-zinc-400 hover:text-white">
                  Discord
                </Link>
              </li>
            </ul>
          </div>

          {/* Organization Section */}
          <div className="col-span-1">
            <h4 className="text-base font-medium mb-4 md:mb-6">Organization</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/divisions" className="text-zinc-400 hover:text-white">
                  Divisions
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-zinc-400 hover:text-white">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-zinc-400 hover:text-white">
                  Terms of use
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
