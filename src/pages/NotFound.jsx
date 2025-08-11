import { Layout } from '../components/layout/Layout';
import { Button } from '../components/shared/Button';
import { Card } from '../components/shared/Card';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, Home } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center px-6 pt-24">
        <Card className="max-w-2xl w-full p-12 text-center">
          <div className="flex justify-center mb-8">
            <AlertOctagon className="w-20 h-20 text-red-500" />
          </div>
          
          <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
          
          <p className="text-zinc-400 mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Please check the URL or try navigating back to the home page.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              variant="secondary"
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            
            <Button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto"
            >
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default NotFound;