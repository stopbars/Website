import { MapPin, ArrowRight, Cpu, Users } from '../shared/Icons';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useNavigate } from 'react-router-dom';

export const Documentation = () => {
    const navigate = useNavigate();
    
    return (
        <section className="py-24" id="contribute">
            <div className="max-w-7xl mx-auto px-6">
                <div className="mb-16">
                    <h2 className="text-3xl font-bold mb-4">Join Our Contributors</h2>
                    <p className="text-zinc-400">
                        Help expand BARS support to more airports worldwide
                    </p>
                </div>
                
                <div className="grid md:grid-cols-2 gap-8">
                    {/* Controller Contributions */}
                    <Card className="p-6">
                        <div className="flex items-center mb-6">
                            <Cpu className="w-6 h-6 mr-3 text-zinc-400" />
                            <h3 className="text-xl font-medium">For Controllers</h3>
                        </div>
                        
                        <p className="text-zinc-400 mb-6">
                            Enhance your controlling experience by mapping stopbars for your home airport or favorite facilities.
                        </p>
                        
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center text-zinc-300">
                                <MapPin className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                                Map accurate stopbar positions
                            </li>
                            <li className="flex items-center text-zinc-300">
                                <MapPin className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                                Support multiple scenery packages
                            </li>
                            <li className="flex items-center text-zinc-300">
                                <MapPin className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                                Simple submission process
                            </li>
                        </ul>
                    </Card>

                    {/* Community Benefits */}
                    <Card className="p-6">
                        <div className="flex items-center mb-6">
                            <Users className="w-6 h-6 mr-3 text-zinc-400" />
                            <h3 className="text-xl font-medium">Community Impact</h3>
                        </div>
                        
                        <p className="text-zinc-400 mb-6">
                            Your contributions directly enhance the realism and immersion for the entire VATSIM community.
                        </p>
                        
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center text-zinc-300">
                                <MapPin className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                                Improve ground operations
                            </li>
                            <li className="flex items-center text-zinc-300">
                                <MapPin className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                                Expand global coverage
                            </li>
                            <li className="flex items-center text-zinc-300">
                                <MapPin className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                                Join our contributor team
                            </li>
                        </ul>
                    </Card>
                </div>                <div className="mt-12 flex md:justify-start justify-center items-center w-full">
                    <Button 
                        onClick={() => navigate('/contribute')}
                        className="group px-8 py-4 text-lg md:mx-0"
                    >
                        Start Contributing
                        <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </Button>
                </div>
            </div>
        </section>
    );
};

export default Documentation;