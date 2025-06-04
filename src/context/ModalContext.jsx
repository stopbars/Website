import { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <ModalContext.Provider value={{ isAuthModalOpen, setIsAuthModalOpen }}>
      {children}
    </ModalContext.Provider>
  );
}

ModalProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};