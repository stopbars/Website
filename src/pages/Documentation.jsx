import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { DocsLayout } from '../components/docs/DocsLayout';
import { DocsContent } from '../components/docs/DocsContent';
import { DocsSidebar } from '../components/docs/DocsSidebar';

const Documentation = () => {
  const { docType } = useParams();
  const navigate = useNavigate();
  const [currentDoc, setCurrentDoc] = useState(docType || 'pilot');
  const [content, setContent] = useState('');
  const [error, setError] = useState(null);

  const handleDocChange = (newDoc) => {
    setCurrentDoc(newDoc);
    navigate(`/docs/${newDoc}`);
  };

  useEffect(() => {
    if (docType && ['pilot', 'controller', 'euroscope'].includes(docType)) {
      setCurrentDoc(docType);
    } else if (docType) {
      navigate('/documentation', { replace: true });
    }
  }, [docType, navigate]);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        const response = await fetch(`/docs/${currentDoc}/index.md`);
        if (!response.ok) {
          throw new Error('Failed to load documentation');
        }
        const text = await response.text();
        setContent(text);
        setError(null);
      } catch (error) {
        console.error('Error loading document:', error);
        setError('Failed to load documentation');
      }
    };

    loadDocument();
  }, [currentDoc]);

  return (
    <Layout>
      <div className="pt-28">
        <DocsLayout>
          <DocsSidebar
            currentDoc={currentDoc}
            onDocChange={handleDocChange}
            content={content}
          />
          {error ? (
            <div className="flex-1 text-red-500">{error}</div>
          ) : (
            <DocsContent content={content} />
          )}
        </DocsLayout>
      </div>
    </Layout>
  );
};

export default Documentation;