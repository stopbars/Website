import { Layout } from '../components/layout/Layout';
import { Hero } from '../components/home/Hero';
import { DonationBanner } from '../components/home/DonationBanner';
import { Documentation } from '../components/home/Documentation';
import { Airports } from '../components/home/Airports';
import { FAQ } from '../components/home/FAQ';
import { Support } from '../components/home/Support';
import { CTA } from '../components/home/CTA';
import { useEffect } from 'react';

const Home = () => {
  useEffect(() => {
    if (window.location.hash) {
      const element = document.querySelector(window.location.hash);

      if (element) element.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);
  return (
    <Layout>
      <Hero />
      <DonationBanner />
      <Airports />
      <Documentation />
      <FAQ />
      <Support />
      <CTA />
    </Layout>
  );
};

export default Home;
