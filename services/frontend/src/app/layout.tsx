import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Stock & Crypto Tracker',
    description: 'Track stocks and cryptocurrency prices from multiple sources',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

