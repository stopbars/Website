import { HeartHandshake, ArrowRight } from '../shared/Icons';

export const DonationBanner = () => {
  return (
    <section className="py-12 bg-gradient-to-r from-emerald-900/20 to-emerald-800/20">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <div className="flex items-center justify-center space-x-3 mb-6">
          <HeartHandshake className="w-6 h-6 text-emerald-400" />
          <h2 className="text-2xl font-medium">Help Keep BARS&apos;s Free!</h2>
        </div>
        
        <div className="space-y-4 mb-8">
          <p className="text-emerald-300 text-lg">
            Every donation helps us expand our features and improve our services
          </p>
          <div className="bg-zinc-900/30 rounded-lg p-6 max-w-2xl mx-auto">
            <p className="text-zinc-300">
              As our community grows, so do our development and server costs. Your support, 
              no matter how small, directly helps keep BARS free and accessible for everyone.
            </p>
          </div>
        </div>
        
        <a href="https://opencollective.com/stopbars" target="_blank" rel="noopener noreferrer" className="group inline-flex text-lg items-center px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-emerald-500/20">
          Support Development
          <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </section>
  );
};

export default DonationBanner;