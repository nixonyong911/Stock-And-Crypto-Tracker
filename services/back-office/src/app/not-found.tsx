import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-100">404</h1>
        <p className="text-xl text-slate-400 mt-4">Page not found</p>
        <Link
          href="/back-office"
          className="inline-block mt-6 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

