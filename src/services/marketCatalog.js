export const DISPLAY_CURRENCIES = Object.freeze(['USD', 'AED', 'EUR', 'GBP', 'JPY']);

export const MARKET_ASSETS = Object.freeze([
  { id: 'gold', name: 'Gold Spot', symbol: 'XAU/USD', assetClass: 'metal', nativeCurrency: 'USD', defaultUnit: 'troy_ounce', aliases: ['gold', 'xau', 'xau/usd'] },
  { id: 'silver', name: 'Silver Spot', symbol: 'XAG/USD', assetClass: 'metal', nativeCurrency: 'USD', defaultUnit: 'troy_ounce', aliases: ['silver', 'xag', 'xag/usd'] },
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['bitcoin', 'btc', 'btc/usd'] },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['ethereum', 'ether', 'eth', 'eth/usd'] },
  { id: 'solana', name: 'Solana', symbol: 'SOL/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['solana', 'sol', 'sol/usd'] },
  { id: 'apple', name: 'Apple', symbol: 'AAPL', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['apple', 'aapl'] },
  { id: 'nvidia', name: 'NVIDIA', symbol: 'NVDA', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['nvidia', 'nvda'] },
  { id: 'tesla', name: 'Tesla', symbol: 'TSLA', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['tesla', 'tsla'] },
  { id: 'microsoft', name: 'Microsoft', symbol: 'MSFT', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['microsoft', 'msft'] },
  { id: 'alphabet', name: 'Alphabet', symbol: 'GOOGL', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['alphabet', 'google', 'googl'] },
  { id: 'amazon', name: 'Amazon', symbol: 'AMZN', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['amazon', 'amzn'] },
  { id: 'fx-usd', name: 'US Dollar', symbol: 'USD/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['usd', 'us dollar', 'dollar'] },
  { id: 'fx-aed', name: 'UAE Dirham', symbol: 'AED/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['aed', 'uae dirham', 'dirham'] },
  { id: 'fx-eur', name: 'Euro', symbol: 'EUR/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['eur', 'euro'] },
  { id: 'fx-gbp', name: 'British Pound', symbol: 'GBP/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['gbp', 'british pound', 'pound sterling'] },
  { id: 'fx-jpy', name: 'Japanese Yen', symbol: 'JPY/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['jpy', 'japanese yen', 'yen'] }
]);

const byId = new Map(MARKET_ASSETS.map((asset) => [asset.id, asset]));
const byAlias = new Map(MARKET_ASSETS.flatMap((asset) => asset.aliases.map((alias) => [alias, asset])));

export function getAssetById(id) {
  return byId.get(String(id || '').toLowerCase()) || null;
}

export function findAssetByAlias(value) {
  return byAlias.get(String(value || '').trim().toLowerCase()) || null;
}
