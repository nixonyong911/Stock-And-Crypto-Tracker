type SEOEvent = {
  event: string;
  category: string;
  label?: string;
  value?: number;
};

export function trackSEOEvent({ event, category, label, value }: SEOEvent) {
  if (typeof window === "undefined") return;

  // GA4 custom event
  if (typeof window.gtag === "function") {
    window.gtag("event", event, {
      event_category: category,
      event_label: label,
      value,
    });
  }
}

export function trackTickerCTA(symbol: string, destination: "telegram" | "pricing") {
  trackSEOEvent({
    event: "ticker_cta_click",
    category: "conversion",
    label: `${symbol}_${destination}`,
  });
}

export function trackBlogCTA(slug: string, destination: string) {
  trackSEOEvent({
    event: "blog_cta_click",
    category: "conversion",
    label: `${slug}_${destination}`,
  });
}

export function trackFAQExpand(page: string, question: string) {
  trackSEOEvent({
    event: "faq_expand",
    category: "engagement",
    label: `${page}_${question.slice(0, 50)}`,
  });
}
