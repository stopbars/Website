import { useState, useEffect } from 'react';
import { Button } from './Button';

const ComingSoon = () => {
    const [showToggle, setShowToggle] = useState(false);
    const [keySequence, setKeySequence] = useState('');
    const targetSequence = 'barsv2';

    useEffect(() => {
        const handleKeyPress = (e) => {
            const newSequence = (keySequence + e.key.toLowerCase()).slice(-targetSequence.length);
            setKeySequence(newSequence);

            if (newSequence === targetSequence) {
                setShowToggle(true);
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [keySequence]);

    const toggleMaintenanceMode = () => {
        const isEnabled = localStorage.getItem('bars-maintenance-mode') === 'true';
        localStorage.setItem('bars-maintenance-mode', (!isEnabled).toString());
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
            <div className="max-w-4xl mx-auto text-center">
                {/* Main Coming Soon Message */}
                <div className="mb-16">
                    <h1 className="text-7xl md:text-8xl lg:text-9xl font-extrabold mb-8 tracking-tight">
                        <span className="bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-transparent bg-clip-text inline-block">
                            COMING
                        </span>
                        <br />
                        <span className="bg-gradient-to-r from-zinc-200 via-white to-zinc-300 text-transparent bg-clip-text inline-block mt-2">
                            SOON
                        </span>
                    </h1>
                    <div className="w-24 h-1 bg-red-500 mx-auto my-8 rounded-full"></div>
                </div>

                {/* Brief Message */}
                <div className="max-w-3xl mx-auto text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                        BARS V2 is right around the corner!
                    </h2>
                    <p className="text-lg md:text-xl text-zinc-400 leading-relaxed mb-8">
                        BARS is now <span className="text-red-400 font-semibold">open source</span>!
                        Join our Discord to see the latest announcements for exciting new features
                        like Follow The Greens, real-time syncing, 3D models and more!
                    </p>

                    {/* Discord CTA */}
                    <a
                        href="https://discord.gg/7EhmtwKWzs"
                        className="inline-flex items-center space-x-3 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-4 rounded-lg transition-all duration-200 transform hover:scale-105"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0001 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z" />
                        </svg>
                        <span>Join Discord</span>
                    </a>
                </div>
                {showToggle && (
                    <div className="mt-12 mx-auto max-w-md p-6 bg-gradient-to-br from-red-900/30 via-red-800/20 to-red-900/30 rounded-xl border border-red-500/40 backdrop-blur-sm shadow-2xl animate-fade-in">
                        <div className="text-center">
                            <div className="inline-flex items-center space-x-2 mb-4">
                                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                                <p className="text-red-400 text-sm font-medium tracking-wide">DEVELOPER MODE</p>
                                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                            </div>
                            <Button
                                onClick={toggleMaintenanceMode}
                                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-red-500/25"
                            >
                                Exit Maintenance Mode!
                            </Button>
                        </div>
                    </div>
                )}

                {/* Subtle hint */}
                <div className="mt-16 text-xs text-zinc-600">
                    BARS V2 • Open Source • Coming 2025
                </div>
            </div>
        </div>
    );
};

export default ComingSoon;
