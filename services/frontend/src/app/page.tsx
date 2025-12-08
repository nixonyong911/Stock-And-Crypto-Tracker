import { Suspense } from 'react';
import { StockList } from '@/components/StockList';
import { CryptoList } from '@/components/CryptoList';
import { FetchStatus } from '@/components/FetchStatus';
import { Header } from '@/components/Header';
import { LoadingCard } from '@/components/LoadingCard';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Home() {
    return (
        <main className={styles.main}>
            <Header />

            <div className={styles.dashboard}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.iconStock}>📈</span>
                            Stocks
                        </h2>
                        <span className={styles.badge}>Live</span>
                    </div>
                    <Suspense fallback={<LoadingCard count={5} />}>
                        <StockList />
                    </Suspense>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.iconCrypto}>₿</span>
                            Cryptocurrencies
                        </h2>
                        <span className={styles.badge}>Live</span>
                    </div>
                    <Suspense fallback={<LoadingCard count={5} />}>
                        <CryptoList />
                    </Suspense>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.iconStatus}>⚡</span>
                            Data Sources Status
                        </h2>
                    </div>
                    <Suspense fallback={<LoadingCard count={2} />}>
                        <FetchStatus />
                    </Suspense>
                </section>
            </div>
        </main>
    );
}

