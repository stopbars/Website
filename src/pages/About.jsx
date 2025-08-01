import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { useEffect, useRef } from 'react';
import { 
  MessagesSquare, 
  ArrowRight, 
  Server,
  Network,
  Settings,
  Users,
  Download,
  Github,
  PlaneTakeoff,
  Lightbulb,
  Zap,
  Shield,
  Globe,
  Code,
  Users2,
  Heart,
  Clock,
  Star,
  CheckCircle,
  Sparkles,
  Building,
  Wifi,
  Palette,
  Lock,
  Eye,
  SunDim,
  ArrowRightFromLine,
  Cuboid,
  TowerControl,
  Building2,
  CodeXml
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
       <div className="max-w-5xl mx-auto px-6 py-12 pt-12 space-y-16">
         
            {/* Page Header */}
             <section className="text-center mb-12">
              <h1 className="text-5xl font-black mb-4 bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                About BARS
              </h1>
            </section>
         
          {/* What is BARS Section */}
          <section className="mb-8">
            <Card className="p-8 bg-gradient-to-br from-zinc-900 to-zinc-900/50">
              <h2 className="text-2xl font-semibold mb-6">What is <span className="text-red-500">BARS</span>?</h2>
                 <p className="text-zinc-300 leading-relaxed mb-4">
                 BARS is a comprehensive airport lighting simulation platform that bridges the gap between flight simulators and virtual ATC environments. Our advanced system synchronizes real-time airport lighting states, including stopbars, follow-the-greens, gate lead-in lighting, and runway lead-on lights, creating an unparalleled level of realism in virtual aviation.
               </p>
               <p className="text-zinc-300 leading-relaxed">
                 By leveraging SimConnect technology and establishing seamless connections with popular ATC clients like vatSys and EuroScope, BARS transforms ground operations into a truly coordinated experience. Our platform supports both default and third-party scenery, automatically adapting lighting positions to match your specific airport configurations.
               </p>
            </Card>
          </section>

         {/* Divider */}
         <div className="border-t border-zinc-800"></div>

          {/* How It Works */}
          <section>
            <h2 className="text-3xl font-semibold mb-8">How It Works</h2>
                   <div className="relative">
                  {/* Vertical line connecting steps */}
                 <div className="absolute left-8 top-0 w-1 bg-green-500" style={{ height: 'calc(100% - 2rem)' }}></div>
              
                {/* Steps */}
               <div className="space-y-16">
                    <div className="relative flex items-start">
                   <div className="absolute left-4 w-10 h-10 bg-white rounded-full border-4 border-zinc-900 shadow-lg flex items-center justify-center">
                     <span className="text-zinc-900 font-semibold text-sm">1</span>
                   </div>
                  <div className="ml-20">
                    <div className="flex items-center mb-3">
                      <Download className="w-6 h-6 text-zinc-400 mr-3" />
                      <h3 className="text-xl font-medium">Quick Installation</h3>
                    </div>
                    <p className="text-zinc-300 leading-relaxed">
                      Download and run the BARS Installer for easy management of all BARS updates with update detection, installation paths, setup, and more. Our custom installer handles all installation and configuration automatically.
                    </p>
                  </div>
                </div>

                    <div className="relative flex items-start">
                   <div className="absolute left-4 w-10 h-10 bg-white rounded-full border-4 border-zinc-900 shadow-lg flex items-center justify-center">
                     <span className="text-zinc-900 font-semibold text-sm">2</span>
                   </div>
                  <div className="ml-20">
                    <div className="flex items-center mb-3">
                      <Network className="w-6 h-6 text-zinc-400 mr-3" />
                      <h3 className="text-xl font-medium">Seamless Integration</h3>
                    </div>
                      <p className="text-zinc-300 leading-relaxed">
                       BARS communicates with your simulator and sends requests to the BARS Pilot Client via the Core backend server, with these requests it updates lighting in your simulator through SimConnect and SimObjects, functioning similarly to how popular add-ons like "GSX" work.
                     </p>
                  </div>
                </div>

                   <div className="relative flex items-start">
                   <div className="absolute left-4 w-10 h-10 bg-white rounded-full border-4 border-zinc-900 shadow-lg flex items-center justify-center">
                     <span className="text-zinc-900 font-semibold text-sm">3</span>
                   </div>
                  <div className="ml-20">
                    <div className="flex items-center mb-3">
                      <TowerControl className="w-6 h-6 text-zinc-400 mr-3" />
                      <h3 className="text-xl font-medium">Airport Compatibility</h3>
                    </div>
                      <p className="text-zinc-300 leading-relaxed">
                       Works with default, third-party, and custom scenery, automatically adapting lighting positions based on selection. You select your preferred scenery in the BARS Pilot Client, save your changes, then no need to restart your simulator as it will update lighting positions automatically.
                     </p>
                  </div>
                </div>
              </div>
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
           <h2 className="text-3xl font-semibold mb-8">Contribute</h2>
          
          {/* Airport Contributions */}
          <div className="mb-12">
            <Card className="p-8 bg-gradient-to-br from-emerald-950/30 to-transparent">
              <div className="flex items-center mb-6">
                <PlaneTakeoff className="w-8 h-8 text-emerald-400 mr-4" />
                <h3 className="text-xl font-medium">Airport Lighting Contributions</h3>
              </div>
              <p className="text-zinc-300 leading-relaxed mb-6">
                Help expand BARS through airport mapping and open-source development. Expand airport and scenery compatibility by mapping airport lighting profiles for your home airport or favorite facilities, expanding the number of BARS compatible airports.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3" />
                  Map airport lighting positions
                </div>
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3" />
                  Expand airport and scenery compatibility
                </div>
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3" />
                  Simple submission process
                </div>
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mr-3" />
                  Improve ground operations globally
                </div>
              </div>
              <Button 
                onClick={() => window.location.href = '/contribute'}
                className="group"
              >
                Start Contributing
                <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Card>
          </div>

          {/* GitHub Contributions */}
          <div className="mb-12">
            <Card className="p-8 bg-gradient-to-br from-slate-950/30 to-transparent">
               <div className="flex items-center mb-6">
                 <Github className="w-8 h-8 text-blue-400 mr-4" />
                 <h3 className="text-xl font-medium">Open Source Development</h3>
               </div>
              <p className="text-zinc-300 leading-relaxed mb-6">
                BARS is now open source! Anyone can help contribute to various pieces of BARS infrastructure, help ship features faster and enhance the platform for everyone. Speed up development cycles and ship more features to the community.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3" />
                  Speed up development cycles
                </div>
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3" />
                  Anyone can contribute improvements
                </div>
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3" />
                  Ship more features to the community
                </div>
                <div className="flex items-center text-zinc-300">
                  <CheckCircle className="w-4 h-4 text-blue-400 mr-3" />
                  Enhance BARS faster together
                </div>
              </div>
              <Button 
                onClick={() => window.open('https://github.com/stopbars', '_blank')}
                className="group"
              >
                View on GitHub
                <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Card>
          </div>

           {/* GitHub Contributors - TODO: Add back on a later date */}
           {/* 
           <div>
             <h3 className="text-2xl font-semibold mb-8">Our Contributors</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               <div className="text-center">
                 <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                   <span className="text-white font-semibold text-xl">JD</span>
                 </div>
                 <p className="text-lg font-medium text-zinc-300 mb-1">John Doe</p>
                 <p className="text-sm text-zinc-500">Contributor</p>
               </div>
               <div className="text-center">
                 <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                   <span className="text-white font-semibold text-xl">JS</span>
                 </div>
                 <p className="text-lg font-medium text-zinc-300 mb-1">Jane Smith</p>
                 <p className="text-sm text-zinc-500">Contributor</p>
               </div>
               <div className="text-center">
                 <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                   <span className="text-white font-semibold text-xl">MJ</span>
                 </div>
                 <p className="text-lg font-medium text-zinc-300 mb-1">Mike Johnson</p>
                 <p className="text-sm text-zinc-500">Contributor</p>
               </div>
             </div>
           </div>
           */}
          </section>

         {/* Divider */}
         <div className="border-t border-zinc-800"></div>

          {/* History Timeline */}
          <section>
            <h2 className="text-3xl font-semibold mb-12">History</h2>
            <div className="relative">
                {/* Timeline line - static purple */}
                <div 
                  className="absolute left-20 top-0 w-1 bg-purple-500" 
                  style={{ height: 'calc(100% - 4rem)' }}
                ></div>
             
                {/* Timeline items */}
               <div className="space-y-20">
                                   <div className="relative flex items-start">
                    <div className="absolute left-16 w-8 h-8 bg-purple-500 rounded-full border-4 border-zinc-900 shadow-lg"></div>
                    <div className="ml-32">
                      <div className="text-xl text-purple-400 font-medium mb-3">Q4 2024</div>
                      <h3 className="text-2xl font-semibold mb-4">The Idea</h3>
                      <p className="text-zinc-400 text-xl leading-relaxed">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
                      </p>
                    </div>
                  </div>

                    <div className="relative flex items-start">
                    <div className="absolute left-16 w-8 h-8 bg-purple-500 rounded-full border-4 border-zinc-900 shadow-lg"></div>
                    <div className="ml-32">
                      <div className="text-xl text-purple-400 font-medium mb-3">11 Jan 2025</div>
                      <h3 className="text-2xl font-semibold mb-4">The Big Bang</h3>
                      <p className="text-zinc-400 text-xl leading-relaxed">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
                      </p>
                    </div>
                  </div>

                                   

                    <div className="relative flex items-start">
                    <div className="absolute left-16 w-8 h-8 bg-purple-500 rounded-full border-4 border-zinc-900 shadow-lg"></div>
                    <div className="ml-32">
                      <div className="text-xl text-purple-400 font-medium mb-3">3 Feb 2025</div>
                     <h3 className="text-2xl font-semibold mb-4">BARS Goes Global</h3>
                     <p className="text-zinc-400 text-xl leading-relaxed">
                       Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
                     </p>
                   </div>
                 </div>

                  <div className="relative flex items-start">
                    <div className="absolute left-16 w-8 h-8 bg-purple-500 rounded-full border-4 border-zinc-900 shadow-lg"></div>
                    <div className="ml-32">
                      <div className="text-xl text-purple-400 font-medium mb-3">14 Feb 2025</div>
                     <h3 className="text-2xl font-semibold mb-4">The Future of Airport Lighting Simulation</h3>
                     <p className="text-zinc-400 text-xl leading-relaxed">
                       Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
                     </p>
                   </div>
                 </div>

                  <div className="relative flex items-start">
                    <div className="absolute left-16 w-8 h-8 bg-purple-500 rounded-full border-4 border-zinc-900 shadow-lg"></div>
                    <div className="ml-32">
                      <div className="text-xl text-purple-400 font-medium mb-3">Present</div>
                     <h3 className="text-2xl font-semibold mb-4">What's Next?</h3>
                     <p className="text-zinc-400 text-xl leading-relaxed">
                       Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
                     </p>
                     {/* Note: Product stats will be included here */}
                   </div>
                 </div>
               </div>
           </div>
           </section>

          {/* Divider */}
          <div className="border-t border-zinc-800"></div>

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