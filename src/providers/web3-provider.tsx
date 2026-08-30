import { WagmiProvider, createConfig, http, injected } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { walletConnect } from 'wagmi/connectors'

// const config = createConfig(
//   getDefaultConfig({
//     // Your dApps chains
//     // chains: [mainnet],
//     // transports: {
//     //   // RPC URL for each chain
//     //   [mainnet.id]: http(
//     //     `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_ID}`,
//     //   ),
//     // },
//     chains: [bsc, bscTestnet],
//     connectors: [
//       injected(),
//       walletConnect({
//         projectId: '316843c7685d03b697a4073244b56a94',
//         showQrModal: false,
//       }),
//     ],

//     transports: {
//       // [bsc.id]: fallback([
//       //   http('https://bsc-dataseed.binance.org/'),
//       //   http('https://binance.llamarpc.com'),
//       //   http('https://rpc.ankr.com/bsc'),
//       //   http('https://1rpc.io/bnb'),
//       // ]),
//       // [bscTestnet.id]: fallback([
//       //   http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
//       //   http('https://bsc-testnet.publicnode.com'),
//       // ]),
//       [bsc.id]: http('https://bsc-dataseed.binance.org/'),
//       [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
//     },

//     // Required API Keys
//     walletConnectProjectId: '316843c7685d03b697a4073244b56a94',

//     // Required App Info
//     appName: 'Your App Name',

//     // Optional App Info
//     appDescription: 'Your App Description',
//     appUrl: 'https://family.co', // your app's url
//     appIcon: 'https://family.co/logo.png', // your app's icon, no bigger than 1024x1024px (max. 1MB)
//   }),
// )

const config = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [
    injected(),
    walletConnect({
      projectId: '316843c7685d03b697a4073244b56a94',
      showQrModal: false,
    }),
  ],
  transports: {
    // [bsc.id]: fallback([
    //   http('https://bsc-dataseed.binance.org/'),
    //   http('https://binance.llamarpc.com'),
    //   http('https://rpc.ankr.com/bsc'),
    //   http('https://1rpc.io/bnb'),
    // ]),
    // [bscTestnet.id]: fallback([
    //   http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
    //   http('https://bsc-testnet.publicnode.com'),
    // ]),
    [bsc.id]: http('https://bsc-dataseed.binance.org/'),
    [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
  },
})

const queryClient = new QueryClient()

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          debugMode
          theme="midnight"
          options={{
            language: 'zh-CN',
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
