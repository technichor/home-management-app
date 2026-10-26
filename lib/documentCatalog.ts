import type { DocumentCategory } from "@prisma/client";

// The Documents catalog (docs/domains/documents.md): the categories, in display order, and the document types a family
// keeps, each with what it is per (the household, each member, each vehicle) and whether it is suggested (shown as a
// slot to fill). Fixed in code, not editable by users. Keys are permanent: they are stored on documents and
// dismissals, so never rename or reuse one (a label can change freely).

/** HOUSEHOLD: one slot for the household; PERSON: one per member; VEHICLE: one per Maintenance item of category Vehicle. */
export type DocumentScope = "HOUSEHOLD" | "PERSON" | "VEHICLE";

export type DocumentType = {
  key: string;
  label: string;
  category: DocumentCategory;
  scope: DocumentScope;
  /** Shown as a slot on the page; the others are only in the type picker. */
  suggested: boolean;
};

export const DOCUMENT_CATEGORIES: readonly { key: DocumentCategory; label: string }[] = [
  { key: "IDENTITY", label: "Identity & vital records" },
  { key: "HOME", label: "Home & property" },
  { key: "VEHICLES", label: "Vehicles" },
  { key: "INSURANCE", label: "Insurance" },
  { key: "TAXES", label: "Taxes" },
  { key: "MONEY", label: "Money & accounts" },
  { key: "LEGAL", label: "Legal & estate" },
  { key: "MEDICAL", label: "Medical" },
  { key: "EDUCATION", label: "School & kids" },
  { key: "WORK", label: "Work" },
  { key: "POSSESSIONS", label: "Manuals, warranties & valuables" },
  { key: "OTHER", label: "Other" },
];

/** A category's types: [key, label, scope, suggested]. */
type Row = [key: string, label: string, scope: DocumentScope, suggested?: true];

const ROWS: Record<DocumentCategory, Row[]> = {
  IDENTITY: [
    ["birth-certificate", "Birth certificate", "PERSON", true],
    ["social-security-card", "Social Security card", "PERSON", true],
    ["passport", "Passport", "PERSON", true],
    ["drivers-license", "Driver's license or state ID", "PERSON", true],
    ["passport-card", "Passport card", "PERSON"],
    ["citizenship-certificate", "Citizenship or naturalization certificate", "PERSON"],
    ["trusted-traveler", "Global Entry / TSA PreCheck / NEXUS", "PERSON"],
    ["marriage-certificate", "Marriage certificate", "HOUSEHOLD", true],
    ["divorce-decree", "Divorce decree", "HOUSEHOLD"],
    ["name-change", "Name change documents", "PERSON"],
    ["military-records", "Military records (DD-214)", "PERSON"],
    ["adoption-records", "Adoption records", "PERSON"],
    ["death-certificate", "Death certificate (a relative)", "HOUSEHOLD"],
  ],
  HOME: [
    ["deed", "Deed or title", "HOUSEHOLD", true],
    ["closing-documents", "Closing disclosure and settlement statement", "HOUSEHOLD", true],
    ["mortgage-note", "Mortgage note", "HOUSEHOLD", true],
    ["lease", "Lease agreement", "HOUSEHOLD", true],
    ["property-tax-bill", "Property tax bill or assessment", "HOUSEHOLD", true],
    ["home-improvement-records", "Home improvement receipts and contracts", "HOUSEHOLD", true],
    ["title-insurance", "Title insurance policy", "HOUSEHOLD"],
    ["survey", "Survey or plat", "HOUSEHOLD"],
    ["refinance-documents", "Refinance documents", "HOUSEHOLD"],
    ["heloc-agreement", "HELOC agreement", "HOUSEHOLD"],
    ["home-appraisal", "Home appraisal", "HOUSEHOLD"],
    ["home-inspection", "Home inspection report", "HOUSEHOLD"],
    ["hoa-documents", "HOA documents (CC&Rs, bylaws, rules)", "HOUSEHOLD"],
    ["building-permits", "Building permits", "HOUSEHOLD"],
    ["home-warranty", "Home warranty contract", "HOUSEHOLD"],
    ["floor-plans", "Floor plans", "HOUSEHOLD"],
  ],
  VEHICLES: [
    ["vehicle-title", "Title", "VEHICLE", true],
    ["vehicle-registration", "Registration", "VEHICLE", true],
    ["vehicle-insurance-card", "Insurance card", "VEHICLE", true],
    ["vehicle-loan-or-lease", "Loan or lease agreement", "VEHICLE", true],
    ["vehicle-purchase-agreement", "Purchase agreement or bill of sale", "VEHICLE"],
    ["vehicle-warranty", "Warranty or service contract", "VEHICLE"],
    ["vehicle-service-records", "Service records", "VEHICLE"],
    ["vehicle-lien-release", "Lien release", "VEHICLE"],
  ],
  INSURANCE: [
    ["health-insurance-card", "Health insurance cards", "HOUSEHOLD", true],
    ["home-insurance-policy", "Homeowner's or renter's policy", "HOUSEHOLD", true],
    ["auto-insurance-policy", "Auto policy", "HOUSEHOLD", true],
    ["life-insurance-policy", "Life insurance policy", "HOUSEHOLD", true],
    ["dental-vision-cards", "Dental and vision cards", "HOUSEHOLD"],
    ["umbrella-policy", "Umbrella policy", "HOUSEHOLD"],
    ["disability-policy", "Disability policy", "HOUSEHOLD"],
    ["long-term-care-policy", "Long-term care policy", "HOUSEHOLD"],
    ["flood-policy", "Flood or earthquake policy", "HOUSEHOLD"],
    ["insurance-claim", "Claim records", "HOUSEHOLD"],
  ],
  TAXES: [
    ["federal-tax-return", "Federal tax return", "HOUSEHOLD", true],
    ["state-tax-return", "State tax return", "HOUSEHOLD", true],
    ["w-2", "W-2s", "HOUSEHOLD", true],
    ["form-1099", "1099s", "HOUSEHOLD", true],
    ["form-1098", "1098 (mortgage interest)", "HOUSEHOLD"],
    ["form-1098-education", "1098-T / 1098-E (tuition, student loans)", "HOUSEHOLD"],
    ["form-1095", "1095 (health coverage)", "HOUSEHOLD"],
    ["charitable-receipts", "Charitable donation receipts", "HOUSEHOLD"],
    ["childcare-statements", "Childcare provider statements", "HOUSEHOLD"],
    ["estimated-tax-payments", "Estimated tax payments", "HOUSEHOLD"],
    ["tax-correspondence", "IRS or state letters", "HOUSEHOLD"],
  ],
  MONEY: [
    ["year-end-statements", "Year-end account statements", "HOUSEHOLD", true],
    ["loan-agreement", "Loan agreement (student, personal)", "HOUSEHOLD"],
    ["pay-stubs", "Pay stubs", "PERSON"],
    ["social-security-statement", "Social Security statement", "PERSON"],
    ["stock-grants", "Stock option or RSU grants", "PERSON"],
    ["pension-documents", "Pension documents", "PERSON"],
    ["cost-basis-records", "Investment cost basis records", "HOUSEHOLD"],
  ],
  LEGAL: [
    ["will", "Wills", "HOUSEHOLD", true],
    ["financial-poa", "Financial power of attorney", "HOUSEHOLD", true],
    ["healthcare-directive", "Healthcare directive or power of attorney", "HOUSEHOLD", true],
    ["guardianship-designation", "Guardianship designation for the kids", "HOUSEHOLD", true],
    ["beneficiary-designations", "Beneficiary designations", "HOUSEHOLD", true],
    ["trust", "Trust documents", "HOUSEHOLD"],
    ["prenuptial-agreement", "Prenuptial agreement", "HOUSEHOLD"],
    ["custody-agreement", "Custody agreement", "HOUSEHOLD"],
    ["court-order", "Court orders or settlements", "HOUSEHOLD"],
    ["business-formation", "Business formation (LLC, EIN letter)", "HOUSEHOLD"],
  ],
  MEDICAL: [
    ["immunization-records", "Immunization records", "PERSON", true],
    ["medication-list", "Current medication list", "PERSON"],
    ["allergy-action-plan", "Allergy or asthma action plan", "PERSON"],
    ["vision-prescription", "Glasses or contacts prescription", "PERSON"],
    ["medical-history", "Medical history summary", "PERSON"],
    ["sports-physical", "Sports physical", "PERSON"],
    ["school-health-form", "School health form", "PERSON"],
  ],
  EDUCATION: [
    ["diploma", "Diplomas and degrees", "PERSON"],
    ["transcript", "Transcripts", "PERSON"],
    ["report-card", "Report cards", "PERSON"],
    ["test-scores", "Standardized test scores", "PERSON"],
    ["iep-504-plan", "IEP or 504 plan", "PERSON"],
    ["school-enrollment", "School enrollment documents", "HOUSEHOLD"],
    ["childcare-agreement", "Childcare or nanny agreement", "HOUSEHOLD"],
    ["activity-waivers", "Camp and activity forms and waivers", "HOUSEHOLD"],
  ],
  WORK: [
    ["offer-letter", "Offer letter or employment contract", "PERSON"],
    ["severance-agreement", "Severance or separation agreement", "PERSON"],
    ["benefits-summary", "Benefits enrollment summary", "PERSON"],
    ["professional-license", "Professional license or certification", "PERSON"],
    ["retirement-rollover", "401(k) rollover paperwork", "PERSON"],
  ],
  POSSESSIONS: [
    ["home-inventory", "Home inventory photos or video", "HOUSEHOLD", true],
    ["manual", "Manual", "HOUSEHOLD"],
    ["product-warranty", "Warranty", "HOUSEHOLD"],
    ["purchase-receipt", "Purchase receipt", "HOUSEHOLD"],
    ["valuables-appraisal", "Appraisal (jewelry, art, collectibles)", "HOUSEHOLD"],
  ],
  OTHER: [
    ["membership", "Membership cards and contracts", "HOUSEHOLD"],
    ["service-contract", "Service contract: internet, security, lawn care", "HOUSEHOLD"],
  ],
};

/** Every type, in catalog order (category order, then the order within the category). */
export const DOCUMENT_TYPES: readonly DocumentType[] = DOCUMENT_CATEGORIES.flatMap(({ key: category }) =>
  ROWS[category].map(([key, label, scope, suggested]) => ({ key, label, category, scope, suggested: suggested === true })),
);

const BY_KEY = new Map(DOCUMENT_TYPES.map((t) => [t.key, t]));

/** The type with this key, or undefined (a custom document, or a key the catalog doesn't have). */
export const typeByKey = (key: string | null | undefined): DocumentType | undefined => (key ? BY_KEY.get(key) : undefined);

/** A category's types, in catalog order. */
export const typesInCategory = (category: DocumentCategory): DocumentType[] => DOCUMENT_TYPES.filter((t) => t.category === category);

/** A category's label ("Identity & vital records"). */
export const categoryLabel = (category: DocumentCategory): string => DOCUMENT_CATEGORIES.find((c) => c.key === category)!.label;
