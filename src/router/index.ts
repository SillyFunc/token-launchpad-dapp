import { createHashRouter, redirect } from 'react-router'
import { MainLayout } from '../layouts/main-layout'
import { Board } from '../pages/board'
import { Launch } from '../pages/launch'
import { Prelaunch } from '../pages/prelaunch'
import { Me } from '../pages/me'
import { Dashboard } from '@/pages/dashboard'
import { Presale } from '@/pages/presale'

export const router = createHashRouter([
  {
    path: '/',
    Component: MainLayout,
    children: [
      {
        index: true,
        loader: () => redirect('/board'),
      },
      {
        path: 'board',
        Component: Board,
      },
      {
        path: 'launch',
        Component: Launch,
      },
      {
        path: 'prelaunch',
        Component: Prelaunch,
      },
      {
        path: 'me',
        Component: Me,
      },
      {
        path: 'dashboard',
        Component: Dashboard,
      },
      {
        path: 'presale',
        Component: Presale,
      },
    ],
  },
])
