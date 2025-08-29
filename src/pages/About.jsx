import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { 
  MessagesSquare, 
  ArrowRight, 
  Settings,
  Users,
  Download,
  Github,
  PlaneTakeoff,
  Zap,
  Network,
  Users2,
  CheckCircle,
  Building,
  Wifi,
  SunDim,
  ArrowRightFromLine,
  Cuboid,
  TowerControl,
  Building2,
  CodeXml,
  Code
} from 'lucide-react';

const About = () => {

  
  return (
    <Layout>
      {/* Page Header */}
       <section className="relative pt-24 pb-5">
         <div className="max-w-5xl mx-auto px-6">
         </div>
       </section>

      {/* Main Content */}
       <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pt-8 sm:pt-12 space-y-12 sm:space-y-16">
            {/* Page Header */}
             <section className="text-center mb-8 sm:mb-12">
              <h1 className="text-5xl sm:text-5xl lg:text-6xl font-bold mb-4 text-white">
                About BARS
              </h1>
            </section>
          {/* What is BARS Section */}
          <section className="mb-6 sm:mb-8">
            <Card className="p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50">
              <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">What is <span className="text-red-500">BARS</span>?</h2>
                 <p className="text-zinc-300 leading-relaxed mb-4 text-sm sm:text-base">
                 BARS is a comprehensive airport lighting simulation platform that bridges the gap between flight simulators and virtual ATC environments. Our advanced system synchronizes real-time airport lighting states, including stopbars, follow-the-greens, gate lead-in lighting, and runway lead-on lights, from virtual controllers client, directly to the simulator, creating an never before seen level of airport lighting realism.
               </p>
               <p className="text-zinc-300 leading-relaxed text-sm sm:text-base">
                 By leveraging SimConnect technology and establishing seamless connections with popular ATC clients like vatSys and EuroScope, BARS provides a never before seen level of realism for virtual controllers and pilots. BARS supports both default and third-party scenery, automatically adapting lighting positions to match your specific airport configurations.
               </p>
            </Card>
          </section>

          {/* Divider */}
          <div className="border-t border-zinc-800"></div>

          {/* How It Works */}
          <section>
            <h2 className="text-3xl font-semibold mb-8">How It Works</h2>
            <div className="space-y-8">
              <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50">
                <div className="flex items-center mb-3">
                  <Download className="w-6 h-6 text-zinc-400 mr-3" />
                  <h3 className="text-xl font-medium">Quick Installation</h3>
                </div>
                <p className="text-zinc-300 leading-relaxed">
                  Download and run the BARS Installer for easy management of all BARS updates with update detection, installation paths, setup, and more. Our custom installer handles all installation and configuration automatically.
                </p>
              </Card>

              <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50">
                <div className="flex items-center mb-3">
                  <Network className="w-6 h-6 text-zinc-400 mr-3" />
                  <h3 className="text-xl font-medium">Seamless Integration</h3>
                </div>
                <p className="text-zinc-300 leading-relaxed">
                  BARS communicates with your simulator and sends requests to the BARS Pilot Client via the Core backend server, with these requests it updates lighting in your simulator through SimConnect and SimObjects, functioning similarly to how popular add-ons like &quot;GSX&quot; work.
                </p>
              </Card>

              <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50">
                <div className="flex items-center mb-3">
                  <TowerControl className="w-6 h-6 text-zinc-400 mr-3" />
                  <h3 className="text-xl font-medium">Airport Compatibility</h3>
                </div>
                <p className="text-zinc-300 leading-relaxed">
                  Works with default, third-party, and custom scenery, automatically adapting lighting positions based on selection. You select your preferred scenery in the BARS Pilot Client, save your changes, then no need to restart your simulator as it will update lighting positions automatically.
                </p>
              </Card>
            </div>
          </section>

          {/* Divider */}
          <div className="border-t border-zinc-800"></div>

        {/* Features Section */}
         <section>
           <h2 className="text-3xl font-semibold mb-8">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="p-6 bg-gradient-to-br from-red-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <SunDim className="w-6 h-6 text-red-400 mb-3" />
                <h3 className="text-lg font-medium mb-2">Realistic Stopbar Simulations</h3>
                <p className="text-zinc-400 text-sm">
                  Authentic stopbar behavior with proper timing and visual feedback for realistic ground operations.
                </p>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-yellow-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <ArrowRightFromLine className="w-6 h-6 text-yellow-400 mb-3" />
                <h3 className="text-lg font-medium mb-2">Unidirectional Stop Bars</h3>
                <p className="text-zinc-400 text-sm">
                  Directional stopbar control allowing for complex traffic flow management and realistic airport operations.
                </p>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-blue-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <Cuboid className="w-6 h-6 text-blue-400 mb-3" />
                <h3 className="text-lg font-medium mb-2">3D Realistic Models</h3>
                <p className="text-zinc-400 text-sm">
                  High-quality 3D stopbar models with authentic lighting effects and proper visual representation.
                </p>
              </Card>

             <Card className="p-6 bg-gradient-to-br from-green-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
               <Zap className="w-6 h-6 text-green-400 mb-3" />
               <h3 className="text-lg font-medium mb-2">Follow the Greens</h3>
                <p className="text-zinc-400 text-sm">
                  Realistic Follow the Greens (FTG) system for guiding pilots around airports through green taxiway lights.
                </p>
             </Card>

              <Card className="p-6 bg-gradient-to-br from-green-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <TowerControl className="w-6 h-6 text-green-400 mb-3" />
                <h3 className="text-lg font-medium mb-2">Runway Lead-on Lights</h3>
                <p className="text-zinc-400 text-sm">
                  Lead-on lights to the runway which are realistically displayed after stopbars are turned off at holding points.
                </p>
              </Card>

             <Card className="p-6 bg-gradient-to-br from-green-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
               <Building className="w-6 h-6 text-green-400 mb-3" />
               <h3 className="text-lg font-medium mb-2">Gate Lead-in Lighting</h3>
               <p className="text-zinc-400 text-sm">
                 Terminal gate lighting systems with precise positioning and timing for realistic gate operations.
               </p>
             </Card>

              <Card className="p-6 bg-gradient-to-br from-cyan-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <Building2 className="w-6 h-6 text-cyan-400 mb-3" />
                <h3 className="text-lg font-medium mb-2">Universal Scenery Support</h3>
                <p className="text-zinc-400 text-sm">
                  Works with default, third-party, and custom scenery, automatically adapting lighting positions based on selection.
                </p>
              </Card>

             <Card className="p-6 bg-gradient-to-br from-orange-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
               <Wifi className="w-6 h-6 text-orange-400 mb-3" />
               <h3 className="text-lg font-medium mb-2">Real-time Syncing</h3>
               <p className="text-zinc-400 text-sm">
                 Instant synchronization between controllers and pilots simulators for realistic lighting operations.
               </p>
             </Card>

             <Card className="p-6 bg-gradient-to-br from-orange-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
               <Users2 className="w-6 h-6 text-orange-400 mb-3" />
               <h3 className="text-lg font-medium mb-2">VATSIM Division Management</h3>
               <p className="text-zinc-400 text-sm">
                 Integrated division management system for managing your division members, airports, lighting, and more.
               </p>
             </Card>

              <Card className="p-6 bg-gradient-to-br from-violet-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <TowerControl className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="text-lg font-medium mb-2">Controller Client Integration</h3>
                <p className="text-zinc-400 text-sm">
                 Native vatSys and EuroScope plugins for seamless integration with existing ATC clients.
                </p>
              </Card>

             <Card className="p-6 bg-gradient-to-br from-rose-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer">
               <Code className="w-6 h-6 text-rose-400 mb-3" />
               <h3 className="text-lg font-medium mb-2">Simulator Integration</h3>
               <p className="text-zinc-400 text-sm">
                 MSFS 2020 and 2024 integration through the BARS Pilot Client for stable simulator connectivity.
               </p>
             </Card>

              <Card 
                className="p-6 bg-gradient-to-br from-green-950/30 to-transparent transition-all duration-300 transform hover:scale-105 cursor-pointer"
                onClick={() => window.open('https://github.com/stopbars/', '_blank')}
              >
                <CodeXml className="w-6 h-6 text-green-400 mb-3" />
                <h3 className="text-lg font-medium mb-2">Open Source</h3>
                <p className="text-zinc-400 text-sm">
                  Community-driven development with transparent codebase and detailed contributing guides.
                </p>
              </Card>
          </div>
          </section>

         {/* Divider */}
         <div className="border-t border-zinc-800"></div>

         {/* Contribute Section */}
         <section>
           <h2 className="text-2xl sm:text-3xl font-semibold mb-6 sm:mb-8">Contribute</h2>
          
          {/* Airport Contributions */}
          <div className="mb-8 sm:mb-12">
            <Card className="p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-emerald-950/30 to-transparent">
              <div className="flex flex-col sm:flex-row sm:items-center mb-4 sm:mb-6">
                <PlaneTakeoff className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400 mb-2 sm:mb-0 sm:mr-4" />
                <h3 className="text-lg sm:text-xl font-medium">Airport Lighting Contributions</h3>
              </div>
              <p className="text-zinc-300 leading-relaxed mb-4 sm:mb-6 text-sm sm:text-base">
                Help expand BARS through airport mapping and open-source development. Expand airport and scenery compatibility by mapping airport lighting profiles for your home airport or favorite facilities, expanding the number of BARS compatible airports.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3 flex-shrink-0" />
                  Map airport lighting positions
                </div>
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3 flex-shrink-0" />
                  Expand airport and scenery compatibility
                </div>
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3 flex-shrink-0" />
                  Simple submission process
                </div>
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3 flex-shrink-0" />
                  Improve ground operations globally
                </div>
              </div>
              <Button 
                onClick={() => window.location.href = '/contribute'}
                className="group w-full sm:w-auto"
              >
                Start Contributing
                <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Card>
          </div>

          {/* GitHub Contributions */}
          <div className="mb-8 sm:mb-12">
            <Card className="p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-slate-950/30 to-transparent">
               <div className="flex flex-col sm:flex-row sm:items-center mb-4 sm:mb-6">
                 <Github className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 mb-2 sm:mb-0 sm:mr-4" />
                 <h3 className="text-lg sm:text-xl font-medium">Open Source Development</h3>
               </div>
              <p className="text-zinc-300 leading-relaxed mb-4 sm:mb-6 text-sm sm:text-base">
                BARS is now open source! Anyone can help contribute to various pieces of BARS infrastructure, help ship features faster and enhance the platform for everyone. Speed up development cycles and ship more features to the community.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3 flex-shrink-0" />
                  Speed up development cycles
                </div>
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3 flex-shrink-0" />
                  Anyone can contribute improvements
                </div>
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3 flex-shrink-0" />
                  Ship more features to the community
                </div>
                <div className="flex items-center text-zinc-300 text-sm sm:text-base">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3 flex-shrink-0" />
                  Enhance BARS faster together
                </div>
              </div>
              <Button 
                onClick={() => window.open('https://github.com/stopbars', '_blank')}
                className="group w-full sm:w-auto"
              >
                View on GitHub
                <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Card>
          </div>
          </section>

         {/* Quick Links Section */}
         <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50 flex flex-col">
             <div className="flex-grow">
               <Settings className="w-8 h-8 text-zinc-400 mb-4" />
               <h2 className="text-2xl font-semibold mb-6">Documentation</h2>
               <p className="text-zinc-300 leading-relaxed">
                 Find comprehensive setup guides, feature explanations, and troubleshooting information in our detailed documentation.
               </p>
             </div>
             <div className="mt-6">
                <Button 
                  onClick={() => window.open('https://docs.stopbars.com', '_blank')}
                  className="w-full group"
                >
                 View Documentation
                 <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
               </Button>
             </div>
           </Card>

           <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50 flex flex-col">
             <div className="flex-grow">
               <Users className="w-8 h-8 text-zinc-400 mb-4" />
               <h2 className="text-2xl font-semibold mb-6">Support</h2>
               <p className="text-zinc-300 leading-relaxed">
                 Need help? Our support team and community are here to assist you with any questions or issues you may encounter.
               </p>
             </div>
             <div className="mt-6">
               <Button 
                 onClick={() => window.location.href = '/support'}
                 className="w-full group"
               >
                 Get Support
                 <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
               </Button>
             </div>
           </Card>
         </section>

         {/* Discord Section */}
         <section className="text-center">
           <Card className="p-8 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40">
             <div className="flex justify-center mb-4">
               <Users2 className="w-12 h-12" />
             </div>
             <h2 className="text-2xl font-semibold mb-4">Join Our Community</h2>
             <p className="text-zinc-300 mb-6">
              Connect with other BARS users, get support, view previews, and stay updated with the latest news and features.
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