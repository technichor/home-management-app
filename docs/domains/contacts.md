# Domain: Contacts & Households

The original spec is the build brief in `CLAUDE.md`. This file records changes made since.

## Birthday (migration 0023, with Scheduling)

`Contact` has three nullable columns: `birthdayMonth`, `birthdayDay`, `birthdayYear`. Month and day go together (both or neither); the year is optional. Rules (`lib/birthday.ts`): a real month/day (Feb 29 allowed without a year, and with a leap year), a year from 1900 to the present, and not in the future. The add/edit form has a birthday field, the detail page shows it ("March 4" or "March 4, 1985"), and it feeds the Calendar (repeating yearly, "turns N" when the year is known). The older `importantDate1/2` fields are unchanged.

## CSV: the optional `birthday` column

`contacts.csv` gains a `birthday` column (`YYYY-MM-DD`, or `MM-DD` when the year is unknown). It is backward compatible:

- **Header absent** (an older file): birthdays are left exactly as they are.
- **Header present, cell blank**: that contact's birthday is cleared.
- **Header present, cell filled**: it is set; a bad value is a row/column error naming the cell.

The import diff names birthday changes in plain language ("birthday added (March 4)", "birthday changed from ... to ...", "birthday removed (was ...)"). Export always includes the column.

## Known gaps (found while building Scheduling, not fixed)

The import diff does not notice changes to important dates, relationship notes or linked family member, so a file that changes only those looks unchanged.
