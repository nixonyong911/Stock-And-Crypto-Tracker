import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <div className="text-center">
          <span className="text-[120px] font-bold leading-none opacity-20 sm:text-[180px]">
            404
          </span>
          <h1 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Page not found
          </h1>
          <p className="mb-8 text-muted-foreground">
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </p>
          <Link
            href="/en"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Homepage
          </Link>
        </div>
      </body>
    </html>
  );
}
