import { Layout } from '../components/layout/Layout';
import { Hero } from '../components/home/Hero';
import { DonationBanner } from '../components/home/DonationBanner';
import { Features } from '../components/home/Features';
import { Documentation } from '../components/home/Documentation';
import { Airports } from '../components/home/Airports';
import { DivisionData } from '../components/home/DivisionData';
import { FAQ } from '../components/home/FAQ';
import { Support } from '../components/home/Support';
import { useEffect } from 'react';

const Home = () => {
  useEffect(() => {
    if (window.location.hash) {
      try {
        const element = document.querySelector(window.location.hash);
        if (element) element.scrollIntoView({ behavior: 'smooth' });
      } catch {
        // Ignore malformed hash selectors.
      }
    }
  }, []);
  return (
    <Layout>
      <Hero />
      <Features />
      <Airports />
      <DivisionData />
      <Documentation />
      <FAQ />
      <DonationBanner />
      <Support />
    </Layout>
  );
};

export default Home;
