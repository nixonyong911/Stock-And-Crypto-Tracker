import { query } from '@/lib/db';
import { StockPrice } from '@/types';
import styles from './PriceList.module.css';

async function getLatestStockPrices(): Promise<StockPrice[]> {
  try {
    const stocks = await query<StockPrice>(`
      SELECT * FROM latest_stock_prices
      ORDER BY symbol
    `);
    return stocks;
  } catch (error) {
    console.error('Error fetching stock prices:', error);
    return [];
  }
}

function formatPrice(price: number | null): string {
  if (price === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatVolume(volume: number | null): string {
  if (volume === null) return '-';
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
  return volume.toString();
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function StockList() {
  const stocks = await getLatestStockPrices();

  if (stocks.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No stock data available yet.</p>
        <p className={styles.hint}>Data will appear once the fetcher service runs.</p>
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
            <th className={styles.numeric}>Volume</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr key={stock.stock_id}>
              <td>
                <span className={styles.symbol}>{stock.symbol}</span>
              </td>
              <td className={styles.name}>{stock.stock_name || '-'}</td>
              <td className={styles.numeric}>{formatPrice(stock.open_price)}</td>
              <td className={`${styles.numeric} ${styles.high}`}>{formatPrice(stock.high_price)}</td>
              <td className={`${styles.numeric} ${styles.low}`}>{formatPrice(stock.low_price)}</td>
              <td className={`${styles.numeric} ${styles.close}`}>{formatPrice(stock.close_price)}</td>
              <td className={styles.numeric}>{formatVolume(stock.volume)}</td>
              <td className={styles.date}>{formatDate(stock.price_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

