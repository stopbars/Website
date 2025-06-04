import { Card } from '../shared/Card';
import { Download, Zap, Building2 } from '../shared/Icons';
import PropTypes from 'prop-types';

const features = [
    {
        icon: Download,
        title: "One-Click Installation",
        description: "Simple installer with automatic configuration - no complex setup required."
    },
    {
        icon: Zap,
        title: "Smart Integration",
        description: "Automatically detects your simulator for perfect compatibility."
    },
    {
        icon: Building2,
        title: "Zero Performance Impact",
        description: "Optimized design ensures no impact on simulator performance."
    }
];

export const Features = () => {
    return (
        <Card className="p-8">
            <div className="space-y-6">
                {features.map((feature, index) => (
                    <FeatureItem 
                        key={index}
                        icon={feature.icon}
                        title={feature.title}
                        description={feature.description}
                    />
                ))}
            </div>
        </Card>
    );
};

const FeatureItem = ({ icon: Icon, title, description }) => (
    <div className="flex items-start space-x-4">
        <Icon className="w-6 h-6 mt-1 text-zinc-400" />
        <div>
            <h3 className="font-medium mb-2">{title}</h3>
            <p className="text-zinc-400 text-sm">{description}</p>
        </div>
    </div>
);

FeatureItem.propTypes = {
    icon: PropTypes.elementType.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired
};