import styles from './LoadingCard.module.css';

interface LoadingCardProps {
  count?: number;
}

export function LoadingCard({ count = 3 }: LoadingCardProps) {
  return (
    <div className={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={styles.row}>
          <div className={`${styles.skeleton} ${styles.short}`} />
          <div className={`${styles.skeleton} ${styles.medium}`} />
          <div className={`${styles.skeleton} ${styles.short}`} />
          <div className={`${styles.skeleton} ${styles.short}`} />
        </div>
      ))}
    </div>
  );
}

