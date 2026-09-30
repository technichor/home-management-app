import ImportClient from "./ImportClient";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ImportClient slug={slug} />;
}
