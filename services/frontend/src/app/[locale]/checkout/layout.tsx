// Force all checkout routes to be dynamically rendered
// (they require runtime data like session_id)
export const dynamic = "force-dynamic";

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
