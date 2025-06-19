import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { 
  MessagesSquare, 
  ArrowRight, 
  Server,
  Network,
  Settings,
  Users  
} from 'lucide-react';

const About = () => {
  return (
    <Layout>
      {/* Page Header */}
      <section className="relative pt-24 pb-5">
        <div className="max-w-5xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-4">About BARS</h1>
          <p className="text-xl text-zinc-300">
            Enhancing virtual ground operations with synchronized stopbar control
          </p>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* What is BARS Section */}
        <section>
          <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50">
          <h2 className="text-2xl font-semibold mb-6">What is <span className="text-red-500">BARS</span>?</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              BARS is a simple yet effective tool that connects your flight simulator with 
              virtual ATC clients to synchronize stopbar states. Working with common platforms 
              like vatSys and EuroScope, BARS helps create a more coordinated experience 
              during ground operations.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              The system supports various airports and grows through community contributions, 
              making ground operations more engaging for both controllers and pilots.
            </p>
          </Card>
        </section>

        {/* Technical Overview */}
        <section>
          <h2 className="text-2xl font-semibold mb-8">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-8 bg-gradient-to-br from-blue-950/50 to-transparent">
              <Server className="w-8 h-8 text-blue-400 mb-4" />
              <h3 className="text-xl font-medium mb-4">Basic Setup</h3>
              <p className="text-zinc-300">
                BARS uses SimConnect to communicate with your flight simulator, similar to other 
                add-ons you might already use. It connects to ATC clients to receive stopbar 
                states and displays them in your simulator.
              </p>
            </Card>

            <Card className="p-8 bg-gradient-to-br from-emerald-950/50 to-transparent">
              <Network className="w-8 h-8 text-emerald-400 mb-4" />
              <h3 className="text-xl font-medium mb-4">Compatibility</h3>
              <p className="text-zinc-300">
                Works with your existing scenery without modifications, whether you&apos;re using 
                default airports or third-party add-ons. BARS keeps things lightweight by only 
                activating when needed.
              </p>
            </Card>
          </div>
        </section>

        {/* Development Roadmap */}
        <section>
          <h2 className="text-2xl font-semibold mb-8">Development Plans</h2>
          <Card className="p-8 bg-gradient-to-br from-purple-950/30 to-transparent">
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium mb-3">Current Version</h3>
                <p className="text-zinc-300">
                  The current release supports Microsoft Flight Simulator 2020 and 2024, 
                  offering basic stopbar functionality with major ATC clients.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-medium mb-3">Future Updates</h3>
                <p className="text-zinc-300">
                  We&apos;re working on improved connectivity and new features like Follow The 
                  Greens (FTG) to further enhance ground operations.
                </p>
              </div>
            </div>
          </Card>
        </section>

      {/* Community Contribution */}
      <section>
        <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50">
          <h2 className="text-2xl font-semibold mb-6">Community Input Welcome</h2>
          <p className="text-zinc-300 leading-relaxed mb-4">
            Want to help expand BARS? Controllers and developers can add support for new 
            airports. Visit{' '}
            <a 
              href="https://stopbars.com/contribute" 
              className="text-blue-400 hover:text-blue-300 underline"
              target="_blank" 
              rel="noopener noreferrer"
            >
              stopbars.com/contribute
            </a>{' '}
            to learn more about contributing to the project.
          </p>
        </Card>
      </section>

      {/* Support Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50 flex flex-col">
          <div className="flex-grow">
            <Settings className="w-8 h-8 text-zinc-400 mb-4" />
            <h2 className="text-2xl font-semibold mb-6">Documentation</h2>
            <p className="text-zinc-300 leading-relaxed">
              Find setup guides and feature explanations in our documentation.
            </p>
          </div>
          <div className="mt-6">
            <Button 
              onClick={() => window.location.href = '/docs'}
              className="w-full"
            >
              View Documentation
            </Button>
          </div>
        </Card>

        <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50 flex flex-col">
          <div className="flex-grow">
            <Users className="w-8 h-8 text-zinc-400 mb-4" />
            <h2 className="text-2xl font-semibold mb-6">Support</h2>
            <p className="text-zinc-300 leading-relaxed">
              Need help? Visit our support page for assistance.
            </p>
          </div>
          <div className="mt-6">
            <Button 
              onClick={() => window.location.href = '/support'}
              className="w-full"
            >
              Get Support
            </Button>
          </div>
        </Card>
      </section>

      {/* Discord Section */}
      <section className="text-center">
        <Card className="p-8 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40">
          <h2 className="text-2xl font-semibold mb-4">Join Our Community</h2>
          <p className="text-zinc-300 mb-6">
            Connect with other users and stay updated on new features.
          </p>
          <div className="flex justify-center">
            <Button 
              onClick={() => window.open('https://discord.gg/7EhmtwKWzs', '_blank')}
              className="group text-lg px-6 py-3"
            >
              <MessagesSquare className="w-5 h-5 mr-2" />
              Join Our Discord
              <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </Card>
      </section>

    </div>
    </Layout>
  );
};

export default About;