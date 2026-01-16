import { Layout } from '../components/layout/Layout';
import { Hero } from '../components/home/Hero';
import { DonationBanner } from '../components/home/DonationBanner';
import { Features } from '../components/home/Features';
import { Documentation } from '../components/home/Documentation';
import { Airports } from '../components/home/Airports';
import { FAQ } from '../components/home/FAQ';
import { Support } from '../components/home/Support';
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
      <Features />
      <Airports />
      <Documentation />
      <FAQ />
      <Support />
    </Layout>
  );
};

export default Home;
