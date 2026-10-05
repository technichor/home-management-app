-- Additive: the kind of a list, and the store section of a grocery list's items.
CREATE TYPE "ListKind" AS ENUM ('STANDARD', 'GROCERY');
CREATE TYPE "GroceryCategory" AS ENUM ('PRODUCE', 'MEAT_SEAFOOD', 'DAIRY_EGGS', 'BAKERY', 'PANTRY', 'FROZEN', 'BEVERAGES', 'SNACKS', 'HOUSEHOLD', 'OTHER');
ALTER TABLE "List" ADD COLUMN "kind" "ListKind" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "ListItem" ADD COLUMN "category" "GroceryCategory";
