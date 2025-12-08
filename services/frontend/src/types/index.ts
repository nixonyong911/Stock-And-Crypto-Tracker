export interface Stock {
    id: string;
    symbol: string;
    name: string | null;
    exchange: string | null;
    currency: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface StockPrice {
    stock_id: string;
    symbol: string;
    stock_name: string | null;
    exchange: string | null;
    currency: string;
    price_date: Date;
    open_price: number | null;
    high_price: number | null;
    low_price: number | null;
    close_price: number;
    adjusted_close: number | null;
    volume: number | null;
    data_source: string;
}

export interface Cryptocurrency {
    id: string;
    symbol: string;
    name: string | null;
    slug: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CryptoPrice {
    crypto_id: string;
    symbol: string;
    crypto_name: string | null;
    price_date: Date;
    open_price: number | null;
    high_price: number | null;
    low_price: number | null;
    close_price: number;
    volume: number | null;
    market_cap: number | null;
    data_source: string;
}

export interface FetchLog {
    id: string;
    source: string;
    fetch_type: string;
    status: string;
    records_fetched: number;
    error_message: string | null;
    started_at: Date;
    completed_at: Date | null;
}

export interface DataSource {
    id: string;
    name: string;
    description: string | null;
    api_type: string;
    is_active: boolean;
}

