export type CommandCategory =
  | "getting-started"
  | "session"
  | "watchlist"
  | "features"
  | "help";

export interface CommandParam {
  name: string;
  description: string;
  required: boolean;
  options?: string[];
}

export interface CommandExample {
  input: string;
  description: string;
}

export interface BotCommand {
  slug: string;
  name: string;
  syntax: string;
  aliases?: string[];
  shortDescription: string;
  description: string;
  category: CommandCategory;
  params?: CommandParam[];
  examples: CommandExample[];
  notes?: string[];
  requiresPairing: boolean;
  requiresSession: boolean;
  tierLimits?: string;
}

export const COMMAND_CATEGORIES: Record<
  CommandCategory,
  { label: string; description: string }
> = {
  "getting-started": {
    label: "Getting Started",
    description: "Set up your account and connect Telegram to the web app.",
  },
  session: {
    label: "Session Management",
    description: "Manage your bot session and check your status.",
  },
  watchlist: {
    label: "Watchlist",
    description:
      "Track stocks, ETFs, and crypto in your personal watchlist.",
  },
  features: {
    label: "Features",
    description: "Access Pro features, subscriptions, and Smart Digest alerts.",
  },
  help: {
    label: "Help & Reference",
    description: "Get help and learn how to use specific commands.",
  },
};

export const COMMANDS: BotCommand[] = [
  {
    slug: "start",
    name: "/start",
    syntax: "/start",
    shortDescription: "Register or pair via deep link",
    description:
      "Registers your Telegram account with the bot. If you open the bot for the first time, this command creates your account automatically. It also handles deep links for pairing your web account and phone verification.",
    category: "getting-started",
    params: [
      {
        name: "deep link",
        description:
          "Optional payload sent via a link, such as a pairing code or verification trigger.",
        required: false,
      },
    ],
    examples: [
      {
        input: "/start",
        description: "Register with the bot for the first time.",
      },
      {
        input: "Open bot via pairing link",
        description:
          "Clicking a pairing link from the web app automatically runs /start with your code.",
      },
    ],
    notes: [
      "This command runs automatically when you first open the bot.",
      "Deep links from the web app handle pairing without you needing to type anything.",
      "After pairing, you'll be prompted to set your timezone with /timezone for localized market times.",
    ],
    requiresPairing: false,
    requiresSession: false,
  },
  {
    slug: "pair",
    name: "/pair",
    syntax: "/pair <code>",
    shortDescription: "Link your web account",
    description:
      "Links your Telegram account to your web account using a 6-digit pairing code. After pairing, you get access to all bot features including AI chat, watchlist management, and Smart Digest alerts.",
    category: "getting-started",
    params: [
      {
        name: "code",
        description:
          "A 6-digit pairing code generated from the web app at stockandcryptotracker.com/pair.",
        required: true,
      },
    ],
    examples: [
      {
        input: "/pair 483291",
        description: "Pair using the code shown on the web app.",
      },
    ],
    notes: [
      "Get your pairing code from stockandcryptotracker.com/pair.",
      "Codes expire after a few minutes, so use them promptly.",
      "Each Telegram account can only be linked to one web account.",
    ],
    requiresPairing: false,
    requiresSession: false,
  },
  {
    slug: "login",
    name: "/login",
    syntax: "/login",
    shortDescription: "Start a new session",
    description:
      "Creates a new bot session so you can interact with the AI assistant and use all commands. Sessions last 7 days before you need to log in again. Any previous session is automatically replaced.",
    category: "getting-started",
    examples: [
      {
        input: "/login",
        description: "Start a new 7-day session.",
      },
    ],
    notes: [
      "You must pair your account before you can log in.",
      "Sessions expire after 7 days. Use /login again to start a new one.",
      "Logging in replaces any existing active session.",
    ],
    requiresPairing: true,
    requiresSession: false,
  },
  {
    slug: "logout",
    name: "/logout",
    syntax: "/logout",
    shortDescription: "End your current session",
    description:
      "Ends your current bot session immediately. After logging out, you will need to use /login to start a new session before you can interact with the bot again.",
    category: "getting-started",
    examples: [
      {
        input: "/logout",
        description: "End your active session.",
      },
    ],
    notes: [
      "Use this if you want to secure your account on a shared device.",
      "You can always log back in with /login.",
    ],
    requiresPairing: true,
    requiresSession: true,
  },
  {
    slug: "refresh",
    name: "/refresh",
    syntax: "/refresh",
    shortDescription: "Clear previous chat session and start fresh",
    description:
      "Resets your conversation context without logging out. This gives you a fresh chat session while keeping your login active. It also refreshes your account tier in case it has changed.",
    category: "session",
    examples: [
      {
        input: "/refresh",
        description: "Start a fresh conversation with the AI.",
      },
    ],
    notes: [
      "Your watchlist and settings are preserved.",
      "Only the conversation history is cleared.",
      "If your tier recently changed (e.g. upgraded to Pro), this command picks it up.",
    ],
    requiresPairing: true,
    requiresSession: true,
  },
  {
    slug: "status",
    name: "/status",
    syntax: "/status",
    shortDescription: "Check your session status",
    description:
      "Shows your current account and session information, including your display name, username, subscription tier, session expiry date, and last active time.",
    category: "session",
    examples: [
      {
        input: "/status",
        description: "View your account info and session details.",
      },
    ],
    notes: [
      "Works even without an active session — it will tell you what to do next.",
      "Shows your current tier (Free, Pro, etc.) and days remaining on your session.",
    ],
    requiresPairing: false,
    requiresSession: false,
  },
  {
    slug: "timezone",
    name: "/timezone",
    syntax: "/timezone [timezone]",
    shortDescription: "Set your timezone for localized market times",
    description:
      "View or set your timezone so market hours and timestamps are shown in your local time. Without arguments, shows your current timezone and a selection of common options. With an IANA timezone name, sets it directly.",
    category: "session",
    params: [
      {
        name: "timezone",
        description:
          "An IANA timezone name (e.g. America/New_York, Pacific/Auckland). Omit to view current setting.",
        required: false,
      },
    ],
    examples: [
      { input: "/timezone", description: "View your current timezone and pick from common options." },
      { input: "/timezone America/New_York", description: "Set your timezone to US Eastern." },
      { input: "/timezone Pacific/Auckland", description: "Set your timezone to New Zealand." },
      { input: "/timezone Asia/Singapore", description: "Set your timezone to Singapore." },
    ],
    notes: [
      "Defaults to UTC if not set.",
      "Market hours and data timestamps in bot responses will be converted to your local time.",
      "You can change your timezone at any time.",
      "Uses IANA timezone names — common options are shown via the inline keyboard.",
    ],
    requiresPairing: true,
    requiresSession: false,
  },
  {
    slug: "add",
    name: "/add",
    syntax: "/add <symbol> [type]",
    shortDescription: "Track a ticker (stock, ETF, crypto)",
    description:
      "Adds a stock, ETF, or cryptocurrency to your personal watchlist. Once added, you can view price data, signals, and key levels via the /wishlist command. New tickers may take 15 minutes to 1 hour for data to populate.",
    category: "watchlist",
    params: [
      {
        name: "symbol",
        description:
          "The ticker symbol to track (e.g. AAPL, SPY, BTC).",
        required: true,
      },
      {
        name: "type",
        description:
          "The asset type. Defaults to stock if omitted.",
        required: false,
        options: ["stock", "etf", "crypto"],
      },
    ],
    examples: [
      { input: "/add AAPL", description: "Add Apple as a stock (default type)." },
      { input: "/add AAPL stock", description: "Explicitly add as a stock." },
      { input: "/add SPY etf", description: "Add SPY as an ETF." },
      { input: "/add BTC crypto", description: "Add Bitcoin as a cryptocurrency." },
      { input: "/add ETH crypto", description: "Add Ethereum as a cryptocurrency." },
    ],
    notes: [
      "If type is omitted, it defaults to stock.",
      "Crypto symbols are auto-normalized (e.g. BTC becomes BTC/USD).",
      "Free tier is limited to 5 tickers. Upgrade to Pro for unlimited tracking.",
      "New tickers may take 15 minutes to 1 hour for data to fully populate.",
      "If signals are already available, you may receive an initial insight when adding.",
    ],
    requiresPairing: true,
    requiresSession: true,
    tierLimits: "Free: 5 tickers max. Pro: unlimited.",
  },
  {
    slug: "remove",
    name: "/remove",
    syntax: "/remove <symbol>",
    shortDescription: "Stop tracking a ticker",
    description:
      "Removes a stock, ETF, or cryptocurrency from your watchlist. You can use the short symbol form for crypto — no need to type the full pair.",
    category: "watchlist",
    params: [
      {
        name: "symbol",
        description: "The ticker symbol to remove (e.g. AAPL, BTC).",
        required: true,
      },
    ],
    examples: [
      { input: "/remove AAPL", description: "Remove a stock or ETF." },
      {
        input: "/remove BTC",
        description: "Remove a cryptocurrency (no need to type BTC/USD).",
      },
    ],
    notes: [
      "Works with both stock/ETF and crypto symbols.",
      "For crypto, use the short form (BTC) — the bot handles the rest.",
    ],
    requiresPairing: true,
    requiresSession: true,
  },
  {
    slug: "wishlist",
    name: "/wishlist",
    syntax: "/wishlist",
    aliases: ["/watchlist"],
    shortDescription: "View your tracked tickers with key levels",
    description:
      "Displays your complete watchlist with current prices, support/resistance/invalidation levels, and weekly/monthly signal analysis. Data is cached and refreshes periodically throughout the day.",
    category: "watchlist",
    examples: [
      {
        input: "/wishlist",
        description: "View all your tracked tickers with analysis.",
      },
      {
        input: "/watchlist",
        description: "Same as /wishlist — both commands work.",
      },
    ],
    notes: [
      "Both /wishlist and /watchlist work identically.",
      "Free tier shows usage count (e.g. 3/5 tickers used).",
      "Tickers marked 'Pending' or 'Building data' are still being analyzed.",
      "Data refreshes automatically — cached until midnight UTC.",
    ],
    requiresPairing: true,
    requiresSession: true,
  },
  {
    slug: "subscribe",
    name: "/subscribe",
    syntax: "/subscribe",
    shortDescription: "Upgrade to Pro or start a free trial",
    description:
      "Shows subscription options including a free 7-day Pro trial (no credit card required) and paid Pro plans. Opens a link to the pricing page where you can complete your upgrade.",
    category: "features",
    examples: [
      {
        input: "/subscribe",
        description: "View upgrade options and pricing.",
      },
    ],
    notes: [
      "The free trial lasts 7 days and requires no credit card.",
      "Pro unlocks unlimited tickers, priority processing, and crypto coverage.",
      "You can subscribe from the web at stockandcryptotracker.com/pricing.",
    ],
    requiresPairing: false,
    requiresSession: false,
  },
  {
    slug: "alert",
    name: "/alert",
    syntax: "/alert [on|off]",
    aliases: ["/track"],
    shortDescription: "Toggle Smart Digest on/off",
    description:
      "Controls your Smart Digest notifications. Smart Digest sends you automated AI-generated insights about your watchlist tickers. Use without arguments to check your current status.",
    category: "features",
    params: [
      {
        name: "on|off",
        description:
          "Turn Smart Digest on or off. Omit to view current status.",
        required: false,
        options: ["on", "off"],
      },
    ],
    examples: [
      { input: "/alert", description: "Check your current Smart Digest status." },
      { input: "/alert on", description: "Enable Smart Digest notifications." },
      { input: "/alert off", description: "Disable Smart Digest notifications." },
    ],
    notes: [
      "Smart Digest is enabled by default when you first set up your account.",
      "You need tickers in your watchlist to receive digest notifications.",
      "The /track command works as an alias for /alert.",
    ],
    requiresPairing: true,
    requiresSession: true,
  },
  {
    slug: "help",
    name: "/help",
    syntax: "/help",
    aliases: ["/menu"],
    shortDescription: "Show available commands",
    description:
      "Displays a complete list of all available bot commands with brief descriptions, along with tips for getting started and using the bot effectively.",
    category: "help",
    examples: [
      { input: "/help", description: "Show the full command list and tips." },
      { input: "/menu", description: "Same as /help — both work." },
    ],
    notes: [
      "Use /help any time you need a quick reference.",
      "Tips include: use /refresh for a new conversation, wait for responses before sending more messages, sessions expire after 7 days.",
    ],
    requiresPairing: false,
    requiresSession: false,
  },
  {
    slug: "addhelp",
    name: "/addhelp",
    syntax: "/addhelp",
    aliases: ["/helpadd"],
    shortDescription: "How to use /add",
    description:
      "Shows detailed usage instructions for the /add command, including syntax, all parameters, examples for different asset types, and important notes about ticker data availability.",
    category: "help",
    examples: [
      {
        input: "/addhelp",
        description: "View detailed /add usage instructions.",
      },
    ],
    requiresPairing: false,
    requiresSession: false,
  },
  {
    slug: "removehelp",
    name: "/removehelp",
    syntax: "/removehelp",
    aliases: ["/helpremove"],
    shortDescription: "How to use /remove",
    description:
      "Shows detailed usage instructions for the /remove command, including examples for removing different asset types.",
    category: "help",
    examples: [
      {
        input: "/removehelp",
        description: "View detailed /remove usage instructions.",
      },
    ],
    requiresPairing: false,
    requiresSession: false,
  },
];

export function getCommandBySlug(slug: string): BotCommand | undefined {
  return COMMANDS.find((cmd) => cmd.slug === slug);
}

export function getCommandsByCategory(
  category: CommandCategory
): BotCommand[] {
  return COMMANDS.filter((cmd) => cmd.category === category);
}

export function getAllCommandSlugs(): string[] {
  return COMMANDS.map((cmd) => cmd.slug);
}
