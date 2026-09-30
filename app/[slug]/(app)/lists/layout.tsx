import ListsNav from "@/components/ListsNav";

export default async function ListsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <>
      <ListsNav slug={slug} />
      {children}
    </>
  );
}
