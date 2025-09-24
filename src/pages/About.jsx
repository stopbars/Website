import { Layout } from '../components/layout/Layout';

const About = () => {
  return (
    <Layout>
      <div className="min-h-screen pt-48 pb-20 bg-950">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-zinc-400 text-lg font-medium mb-4">DMS</p>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-8">
            Division Management System
          </h1>

          <p className="text-xl text-zinc-300 leading-relaxed max-w-3xl mx-auto">
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum Excepteur sint
            occaecat cupidatat non proident, sunt in culpa qui officia
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default About;
