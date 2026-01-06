import Link from 'next/link';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.logoSection}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>◆</span>
          <span className={styles.logoText}>StockTracker</span>
        </div>
        <p className={styles.tagline}>Real-time market data from multiple sources</p>
      </div>
      <div className={styles.rightSection}>
        <Link href="/register" className={styles.registerButton}>
          <span className={styles.registerIcon}>📱</span>
          Register for Telegram Bot
        </Link>
        <div className={styles.timestamp}>
          <span className={styles.label}>Last Updated</span>
          <span className={styles.time}>{new Date().toLocaleString()}</span>
        </div>
      </div>
    </header>
  );
}

