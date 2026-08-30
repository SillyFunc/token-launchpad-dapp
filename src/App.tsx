import { ConnectKitButton } from 'connectkit'
import { Web3Provider } from './providers/web3-provider'

const App = () => {
  return (
    <Web3Provider>
      <ConnectKitButton />
    </Web3Provider>
  )
}

export default App
