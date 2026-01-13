# Keyword Strategy

Analyze content for semantic optimization and keyword placement.

## Focus Areas

- Primary/secondary keyword identification
- Keyword density calculation
- Entity and topical relevance
- LSI (Latent Semantic Indexing) keywords
- Natural language patterns
- Over-optimization detection

## Keyword Density Guidelines

| Type | Target Density | Notes |
|------|---------------|-------|
| Primary keyword | 0.5-1.5% | Main topic keyword |
| Secondary keywords | 0.3-0.5% each | Supporting terms |
| LSI keywords | Natural usage | Semantic variations |

**Warning Signs of Over-Optimization:**
- Same keyword appears unnaturally often
- Keyword stuffing in headers
- Forced keyword placement
- Unnatural sentence structure

## Keyword Placement Strategy

### Priority Locations

1. **Title tag** - Primary keyword near beginning
2. **H1 heading** - Primary keyword included naturally
3. **First paragraph** - Primary keyword in first 100 words
4. **H2 headings** - Secondary keywords
5. **URL slug** - Primary keyword (hyphenated)
6. **Meta description** - Primary keyword + call to action
7. **Image alt text** - Descriptive with keywords where relevant

### Example Implementation

```typescript
// Page targeting "stock market prices"
export const metadata: Metadata = {
  title: 'Stock Market Prices - Live Market Data & Charts',  // Primary in title
  description: 'Track stock market prices in real-time. View charts, trends, and analysis for top stocks.',
}

// Content structure
<h1>Stock Market Prices</h1>                    // Primary keyword
<p>Get the latest stock market prices...</p>    // First paragraph

<h2>How to Read Stock Prices</h2>               // Secondary: "read stock prices"
<h2>Understanding Market Trends</h2>            // Secondary: "market trends"
```

## LSI Keyword Generation

For primary keyword "stock prices", LSI keywords include:
- Stock market
- Share prices
- Trading data
- Market capitalization
- Stock quotes
- Equity prices
- Market value

### Finding LSI Keywords

1. Google autocomplete suggestions
2. "People also ask" section
3. Related searches at bottom of SERP
4. Competitor content analysis
5. Topic clustering tools

## Entity and Topical Relevance

### Entity Co-occurrence

Include related entities to build topical authority:

| Primary Topic | Related Entities |
|---------------|------------------|
| Stock prices | NYSE, NASDAQ, S&P 500, Dow Jones |
| Cryptocurrency | Bitcoin, Ethereum, blockchain, exchanges |
| Market analysis | Technical analysis, fundamental analysis, charts |

### Building Topical Depth

```markdown
# Stock Prices (Primary topic)

## Market Indices (Entity)
- S&P 500
- Dow Jones
- NASDAQ

## Price Metrics (Related concepts)
- Open price
- Close price
- Volume
- Market cap

## Analysis Methods (Topical depth)
- Technical analysis
- Fundamental analysis
```

## Content Optimization Checklist

- [ ] Primary keyword in title (front-loaded)
- [ ] Primary keyword in H1
- [ ] Primary keyword in first 100 words
- [ ] Secondary keywords in H2s
- [ ] LSI keywords distributed naturally
- [ ] Entity co-occurrence included
- [ ] Keyword density within 0.5-1.5%
- [ ] No keyword stuffing
- [ ] Natural reading flow maintained

## Search Intent Assessment

Match content to user intent:

| Intent Type | Query Example | Content Type |
|-------------|---------------|--------------|
| Informational | "what are stock prices" | Educational article |
| Navigational | "AAPL stock price" | Price page |
| Transactional | "buy stocks online" | Service/signup page |
| Commercial | "best stock trading app" | Comparison/review |
