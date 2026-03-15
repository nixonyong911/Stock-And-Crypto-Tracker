import { Header, Footer } from "@/components/layout";
import { DocsSidebar } from "./docs-sidebar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1 container mx-auto">
        <div className="flex">
          <DocsSidebar />
          {children}
        </div>
      </div>
      <Footer />
    </div>
  );
}
