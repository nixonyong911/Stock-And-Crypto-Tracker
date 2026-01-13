# Snippet Optimization

Format content to be eligible for featured snippets and SERP features.

## Featured Snippet Types

### Paragraph Snippets (Most Common)

Direct answer in 40-60 words.

**Format:**
```markdown
## What is [Question]?

[Direct answer in first sentence, 40-60 words total. Clear, concise definition with no unnecessary words. Include the keyword in the opening sentence.]
```

**Example:**
```markdown
## What is a stock price?

A stock price is the current cost to purchase one share of a company's stock on a securities exchange. Stock prices fluctuate throughout trading hours based on supply and demand, company performance, and market conditions.
```

### List Snippets

Numbered steps or bullet points (5-8 items).

**Format:**
```markdown
## How to [Task]

1. **Step one** - Brief description
2. **Step two** - Brief description
3. **Step three** - Brief description
...
```

**Example:**
```markdown
## How to Read Stock Charts

1. **Identify the time frame** - Daily, weekly, or monthly
2. **Read the price axis** - Vertical axis shows price
3. **Check the volume** - Bar chart at bottom
4. **Spot trends** - Look for upward or downward patterns
5. **Find support/resistance** - Price levels that hold
```

### Table Snippets

Comparison data in structured format.

**Format:**
```markdown
## [Comparison Topic]

| Feature | Option A | Option B |
|---------|----------|----------|
| Price   | $X       | $Y       |
| Feature | Yes      | No       |
```

**Example:**
```markdown
## Stock vs Cryptocurrency

| Aspect | Stocks | Cryptocurrency |
|--------|--------|----------------|
| Trading hours | Market hours | 24/7 |
| Regulation | SEC regulated | Varies |
| Volatility | Moderate | High |
```

## Optimization Strategies

### 1. Answer Questions Directly

Use question-based headers that match search queries:

```markdown
## What is the best time to buy stocks?
[40-60 word direct answer]

## How do stock prices change?
[40-60 word direct answer]
```

### 2. Place Answers Near Top

The answer should appear immediately after the question header, not buried in paragraphs.

### 3. Use Proper Formatting

```typescript
// Good - Clear structure
<h2>What is market capitalization?</h2>
<p>Market capitalization is the total value of a company's outstanding shares...</p>

// Bad - Answer buried
<h2>Understanding Market Cap</h2>
<p>There are many ways to value a company. Some investors look at...</p>
<p>Market capitalization is...</p>  // Too far from header
```

## People Also Ask (PAA) Optimization

### Structure FAQ Sections

```typescript
// components/features/FAQ.tsx
export function FAQ({ items }: { items: FAQItem[] }) {
  return (
    <section>
      <h2>Frequently Asked Questions</h2>
      {items.map((item, i) => (
        <details key={i}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </section>
  )
}
```

### FAQ Schema Markup

```typescript
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is a stock price?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A stock price is the current cost to purchase one share...',
      },
    },
    // More questions...
  ],
}
```

## HowTo Schema

For step-by-step content:

```typescript
const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Read Stock Charts',
  description: 'Learn to interpret stock charts for better investment decisions.',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Identify the time frame',
      text: 'Select daily, weekly, or monthly view based on your analysis needs.',
    },
    {
      '@type': 'HowToStep',
      name: 'Read the price axis',
      text: 'The vertical axis displays the stock price range.',
    },
  ],
}
```

## Snippet Eligibility Checklist

For paragraph snippets:
- [ ] Question in H2 or H3 header
- [ ] Answer in first paragraph (40-60 words)
- [ ] Direct, definitive response
- [ ] No filler words

For list snippets:
- [ ] "How to" or "Steps to" header
- [ ] Numbered or bulleted list
- [ ] 5-8 items
- [ ] Clear, concise descriptions

For table snippets:
- [ ] Comparison topic in header
- [ ] Proper table markdown/HTML
- [ ] Clean formatting
- [ ] Relevant data columns

## Content Templates

### Definition Template

```markdown
## What is [Term]?

[Term] is [definition in one sentence]. [One sentence of context/importance]. [One sentence of additional detail or example].
```

### How-To Template

```markdown
## How to [Action]

Follow these steps to [achieve outcome]:

1. **[Action verb] [object]** - [Brief explanation]
2. **[Action verb] [object]** - [Brief explanation]
3. **[Action verb] [object]** - [Brief explanation]

[Optional: One sentence summary or tip]
```

### Comparison Template

```markdown
## [Option A] vs [Option B]

| Feature | [Option A] | [Option B] |
|---------|------------|------------|
| [Key difference 1] | [Value] | [Value] |
| [Key difference 2] | [Value] | [Value] |

[One paragraph summary of when to choose each]
```
