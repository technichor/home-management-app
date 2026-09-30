import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function RootPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (session.householdId && session.householdSlug) {
    redirect(`/${session.householdSlug}/contacts`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Home Management</h1>
        <p className="text-gray-600">
          Visit your household&apos;s URL to log in, or set up a new household account below.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/setup"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Set up a new household account
          </Link>
          <p className="text-sm text-gray-500">
            Already have an account? Go to{" "}
            <span className="font-mono">/your-household-slug</span>
          </p>
        </div>
      </div>
    </div>
  );
}
