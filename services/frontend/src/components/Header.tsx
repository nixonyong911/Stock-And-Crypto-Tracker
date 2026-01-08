import styles from './Header.module.css';

const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'StockTrackerBot';

export function Header() {
  const telegramDeepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=register`;
  
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
        <a 
          href={telegramDeepLink} 
          target="_blank" 
          rel="noopener noreferrer"
          className={styles.registerButton}
        >
          <span className={styles.registerIcon}>📱</span>
          Register for Telegram Bot
        </a>
        <div className={styles.timestamp}>
          <span className={styles.label}>Last Updated</span>
          <span className={styles.time}>{new Date().toLocaleString()}</span>
        </div>
      </div>
    </header>
  );
}

