import ContactsNav from "@/components/ContactsNav";

export default async function ContactsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <>
      <ContactsNav slug={slug} />
      {children}
    </>
  );
}
