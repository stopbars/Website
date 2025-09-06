import { createContext } from 'react';

// Separate file so components can import the context without tripping react-refresh rule
export const AuthContext = createContext(null);
