import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-8">
          <span className="text-[120px] font-bold leading-none text-primary/20 sm:text-[180px]">
            404
          </span>
        </div>

        <h1 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          {t("description")}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              {t("goHome")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/#pricing">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("viewPricing")}
            </Link>
          </Button>
        </div>

        <div className="mt-12 border-t pt-8">
          <p className="mb-4 text-sm text-muted-foreground">
            {t("popularPages")}
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link
              href="/about"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("aboutUs")}
            </Link>
            <Link
              href="/faq"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("faq")}
            </Link>
            <Link
              href="/contact"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("contact")}
            </Link>
            <Link
              href="/blog"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("blog")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
