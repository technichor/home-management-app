import { pageHouseholdId } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { typeByKey } from "@/lib/documentCatalog";
import { documentFormOptions } from "../formOptions";
import DocumentForm from "../DocumentForm";

type Query = { type?: string; contact?: string; item?: string; account?: string; returnTo?: string };

/**
 * Add a document. Anything can be pre-filled from the address (an Add link button, a record's Documents panel); a
 * pre-fill that isn't the household's is left out. From a Maintenance item that isn't a vehicle, the type starts as
 * Manual; from a vehicle it starts empty, with the Vehicles types first.
 */
export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const options = await documentFormOptions(await pageHouseholdId());
  const item = options.items.find((i) => i.id === query.item);
  const typeKey = typeByKey(query.type)?.key ?? (item && !item.isVehicle ? "manual" : null);
  return (
    <DocumentForm
      options={options}
      initial={{
        typeKey,
        ownerContactId: options.members.find((m) => m.id === query.contact)?.id ?? null,
        maintenanceItemId: item?.id ?? null,
        accountRecordId: options.accounts.find((a) => a.id === query.account)?.id ?? null,
      }}
      vehiclesFirst={item?.isVehicle ?? false}
      returnTo={safeNext(query.returnTo)}
    />
  );
}
