import type { Abi } from 'viem'

import CoordinatorFactoryJson from './CoordinatorFactory.json'
import FlapTaxTokenV3Json from './FlapTaxTokenV3.json'
import PresaleJson from './Presale.json'
import PresaleFactoryJson from './PresaleFactory.json'
import TokenFactoryJson from './TokenFactory.json'

export const CoordinatorFactoryAbi = CoordinatorFactoryJson as unknown as Abi
export const FlapTaxTokenV3Abi = FlapTaxTokenV3Json as unknown as Abi
export const PresaleAbi = PresaleJson as unknown as Abi
export const PresaleFactoryAbi = PresaleFactoryJson as unknown as Abi
export const TokenFactoryAbi = TokenFactoryJson as unknown as Abi
