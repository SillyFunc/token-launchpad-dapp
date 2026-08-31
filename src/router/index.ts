import { createBrowserRouter, redirect } from 'react-router'
import { MainLayout } from '../layouts/main-layout'
import { Board } from '../pages/board'
import { Launch } from '../pages/launch2'
import { Prelaunch } from '../pages/prelaunch'
import { Me } from '../pages/me'

export const router = createBrowserRouter([
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
    ],
  },
])
