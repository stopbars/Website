import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';

const EXPLOSION_PARTICLES = 50;
const RAIN_PARTICLES = 100;
const ANIMATION_DURATION = 4000;

const getRandomColor = () => {
  const colors = [
    '#FFD700', // Gold
    '#FF1493', // Deep Pink
    '#FF4500', // Orange Red
    '#40E0D0', // Turquoise
    '#9370DB', // Purple
    '#FF69B4', // Hot Pink
    '#FFA500', // Orange
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

const ExplosionConfetti = ({ angle }) => {
  const distance = Math.random() * 300 + 200;
  const size = Math.random() * 8 + 8;
  
  return (
    <motion.div
      initial={{ 
        x: '-50%',
        y: '-50%',
        scale: 0,
        opacity: 1
      }}
      animate={{
        x: `calc(-50% + ${Math.cos(angle) * distance}px)`,
        y: `calc(-50% + ${Math.sin(angle) * distance}px)`,
        scale: [0, 1, 0.5],
        opacity: [1, 1, 0],
        rotate: Math.random() * 360 * 2
      }}
      transition={{
        duration: 1,
        ease: "easeOut"
      }}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        backgroundColor: getRandomColor(),
        clipPath: Math.random() > 0.5
          ? 'polygon(50% 0%, 100% 100%, 0% 100%)'
          : 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        zIndex: 60,
        pointerEvents: 'none'
      }}
    />
  );
};

const RainConfetti = () => {
  // Distribute starting positions across the width
  const startX = Math.random() * (window.innerWidth + 400) - 200; // Extra width for more coverage
  const endX = startX + (Math.random() * 400 - 200); // Random drift
  
  const size = Math.random() * 10 + 10;
  const duration = Math.random() * 2 + 2.5;
  const delay = Math.random() * 1.5;
  
  // Calculate window top including scroll position
  const windowTop = window.scrollY || document.documentElement.scrollTop;
  
  return (
    <motion.div
    initial={{ 
        x: startX,
        y: windowTop - 50,
        scale: 0,
        opacity: 0
      }}
      animate={{
        x: [startX, endX],
        y: [windowTop - 100, window.innerHeight + 100],
        scale: [0, 1],
        opacity: [0, 1, 1, 0],
        rotate: [0, Math.random() * 360 * 3]
      }}
      transition={{
        duration: duration,
        ease: [0.1, 0.4, 0.8, 1],
        delay: delay
      }}
      style={{
        position: 'fixed',
        width: size,
        height: size,
        backgroundColor: getRandomColor(),
        clipPath: Math.random() > 0.5
          ? 'polygon(50% 0%, 100% 100%, 0% 100%)'
          : 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        filter: 'brightness(1.2)',
        zIndex: 60,
        pointerEvents: 'none'
      }}
    />
  );
};

const EpicCelebration = ({ onComplete }) => {
    const [show, setShow] = useState(true);
  
    useEffect(() => {
      const timer = setTimeout(() => {
        setShow(false);
        if (onComplete) {
          onComplete();
        }
      }, ANIMATION_DURATION);
  
      return () => clearTimeout(timer);
    }, [onComplete]);
  
    return (
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden pointer-events-none"
          >
            {/* Container for centered explosion */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Explosion confetti */}
              {Array.from({ length: EXPLOSION_PARTICLES }).map((_, i) => (
                <ExplosionConfetti 
                  key={`explosion-${i}`} 
                  angle={(i * Math.PI * 2) / EXPLOSION_PARTICLES} 
                />
              ))}
            </div>
  
            {/* Raining confetti */}
            <div className="absolute inset-0">
              {Array.from({ length: RAIN_PARTICLES }).map((_, i) => (
                <RainConfetti key={`rain-${i}`} index={i} />
              ))}
            </div>
  
            {/* Success message with glass effect container */}
            <motion.div
              className="relative z-50 text-center px-8 py-6"
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0 
              }}
              transition={{
                duration: 0.5,
                ease: "backOut",
                delay: 0.2
              }}
            >
              {/* Glass background */}
              <motion.div
                className="absolute inset-0 rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  background: 'rgba(27, 27, 27, 0.84)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(37, 37, 37, 0.2)'
                }}
              />
              
              {/* Text content */}
              <div className="relative">
                <h2 className="text-4xl font-bold text-white mb-3">
                  Submission Successful!
                </h2>
                <p className="text-2xl text-rose-300">
                  Thank you so much ❤️
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

export default EpicCelebration;

ExplosionConfetti.propTypes = {
    angle: PropTypes.number.isRequired
    };

RainConfetti.propTypes = {
    index: PropTypes.number.isRequired
    };

EpicCelebration.propTypes = {
    onComplete: PropTypes.function
    };