import { BookCheck, Compass, GitFork, Info, PackageCheck, Repeat, Scale } from 'lucide-react';

import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

const icons: Record<string, React.ReactNode> = {
  '/': <Compass size={16} />,
  '/dock': <PackageCheck size={16} />,
  '/bench': <Scale size={16} />,
  '/fork': <GitFork size={16} />,
  '/write-offs': <BookCheck size={16} />,
  '/flyers': <Repeat size={16} />,
  '/about': <Info size={16} />,
};

mountApp(
  {
    ...config,
    nav: config.nav.map((item) => ({ ...item, icon: icons[item.to] })),
  },
  <App />,
);
