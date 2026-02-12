import { Outlet } from 'react-router-dom';
import { RouteSeoManager } from './RouteSeoManager';

export const AppRouteShell = () => (
  <>
    <RouteSeoManager />
    <Outlet />
  </>
);
