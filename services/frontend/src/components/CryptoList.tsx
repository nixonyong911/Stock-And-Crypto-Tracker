import { query } from '@/lib/db';
import { CryptoPrice } from '@/types';
import styles from './PriceList.module.css';

async function getLatestCryptoPrices(): Promise<CryptoPrice[]> {
  try {
    const cryptos = await query<CryptoPrice>(`
      SELECT * FROM latest_crypto_prices
      ORDER BY symbol
    `);
    return cryptos;
  } catch (error) {
    console.error('Error fetching crypto prices:', error);
    return [];
  }
}

function formatPrice(price: number | null): string {
  if (price === null) return '-';
  // Crypto prices can be very small or very large
  if (price < 0.01) {
    return `$${price.toFixed(8)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatMarketCap(marketCap: number | null): string {
  if (marketCap === null) return '-';
  if (marketCap >= 1_000_000_000_000) return `$${(marketCap / 1_000_000_000_000).toFixed(2)}T`;
  if (marketCap >= 1_000_000_000) return `$${(marketCap / 1_000_000_000).toFixed(2)}B`;
  if (marketCap >= 1_000_000) return `$${(marketCap / 1_000_000).toFixed(2)}M`;
  return `$${marketCap.toLocaleString()}`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function CryptoList() {
  const cryptos = await getLatestCryptoPrices();

  if (cryptos.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No cryptocurrency data available yet.</p>
        <p className={styles.hint}>Add a crypto data fetcher service to see data here.</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th className={styles.numeric}>Open</th>
            <th className={styles.numeric}>High</th>
            <th className={styles.numeric}>Low</th>
            <th className={styles.numeric}>Close</th>
            <th className={styles.numeric}>Market Cap</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {cryptos.map((crypto) => (
            <tr key={crypto.crypto_id}>
              <td>
                <span className={styles.symbol}>{crypto.symbol}</span>
              </td>
              <td className={styles.name}>{crypto.crypto_name || '-'}</td>
              <td className={styles.numeric}>{formatPrice(crypto.open_price)}</td>
              <td className={`${styles.numeric} ${styles.high}`}>{formatPrice(crypto.high_price)}</td>
              <td className={`${styles.numeric} ${styles.low}`}>{formatPrice(crypto.low_price)}</td>
              <td className={`${styles.numeric} ${styles.close}`}>{formatPrice(crypto.close_price)}</td>
              <td className={styles.numeric}>{formatMarketCap(crypto.market_cap)}</td>
              <td className={styles.date}>{formatDate(crypto.price_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

