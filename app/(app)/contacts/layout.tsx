import ContactsNav from "@/components/ContactsNav";

export default async function ContactsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ContactsNav />
      {children}
    </>
  );
}
