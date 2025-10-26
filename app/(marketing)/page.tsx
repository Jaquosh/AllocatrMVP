import Link from "next/link";

export default function MarketingPage() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          Allocatr
        </h1>
        <p className="mt-6 text-xl text-gray-600">
          Smart SKU Distribution
        </p>
        <p className="mt-4 text-lg text-gray-500">
          Allocate product order quantities across warehouses based on forecast, inventory, and coverage targets.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link
            href="/dashboard"
            className="rounded-md bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
