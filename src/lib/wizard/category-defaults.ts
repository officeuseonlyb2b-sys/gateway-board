// Default Inclusions/Exclusions per hotel category, used in Step 15
// to auto-fill each Option's inclusions/exclusions when the user selects
// a category. Users may freely add/remove after auto-fill.

export interface CategoryDefaults {
  inclusions: string[];
  exclusions: string[];
}

const D: Record<string, CategoryDefaults> = {
  "Home Stay": {
    inclusions: ["Accommodation", "Home-cooked Meals", "Local Host Experience"],
    exclusions: ["Transport", "Entry fees", "Personal expenses"],
  },
  "Excellent Budget": {
    inclusions: ["Accommodation", "Breakfast", "All applicable taxes"],
    exclusions: ["Lunch & Dinner", "Transport", "Airfare", "Personal expenses"],
  },
  "3 Star": {
    inclusions: [
      "Accommodation on twin sharing",
      "Daily breakfast",
      "All transfers & sightseeing by AC vehicle",
      "All applicable taxes",
    ],
    exclusions: [
      "Airfare / train fare",
      "Lunch & dinner unless specified",
      "Personal expenses (laundry, tips, phone calls)",
      "Anything not mentioned in inclusions",
    ],
  },
  "3 Star Deluxe": {
    inclusions: [
      "Accommodation on twin sharing",
      "Daily breakfast",
      "All transfers by AC vehicle",
      "Applicable taxes",
    ],
    exclusions: ["Airfare / train fare", "Lunch & dinner", "Personal expenses"],
  },
  "4 Star": {
    inclusions: [
      "Accommodation on twin sharing",
      "Daily breakfast",
      "Airport/railway transfers",
      "Sightseeing by AC vehicle",
      "All applicable taxes",
    ],
    exclusions: [
      "Airfare / train tickets",
      "Meals not specified",
      "Personal expenses",
      "Monument entry fees",
    ],
  },
  "4 Star Superior": {
    inclusions: [
      "Accommodation on twin sharing",
      "Daily breakfast",
      "All transfers & sightseeing",
      "Wi-Fi at hotel",
      "All applicable taxes",
    ],
    exclusions: [
      "Airfare / train tickets",
      "Lunch & dinner unless included",
      "Personal expenses",
      "Optional activities",
    ],
  },
  "5 Star": {
    inclusions: [
      "Accommodation (Deluxe room on twin sharing)",
      "Daily breakfast",
      "Airport transfers",
      "Sightseeing by AC vehicle",
      "Complimentary Wi-Fi",
      "All applicable taxes",
    ],
    exclusions: [
      "Airfare / train tickets",
      "Meals beyond breakfast",
      "Personal expenses",
      "Tips & gratuities",
    ],
  },
  "5 Star Deluxe": {
    inclusions: [
      "Accommodation (Deluxe/Superior room on twin sharing)",
      "Daily breakfast",
      "Airport & railway transfers",
      "Sightseeing in luxury AC vehicle",
      "Wi-Fi",
      "All taxes",
    ],
    exclusions: [
      "Airfare",
      "Meals beyond breakfast",
      "Spa & personal services",
      "Tips",
      "Optional excursions",
    ],
  },
  "Heritage": {
    inclusions: [
      "Accommodation in heritage property",
      "Daily breakfast",
      "Welcome drink on arrival",
      "Heritage property tour",
      "All transfers",
      "All applicable taxes",
    ],
    exclusions: [
      "Airfare / train fare",
      "Lunch & dinner unless specified",
      "Personal expenses",
      "Optional cultural shows",
    ],
  },
  "Experiential": {
    inclusions: [
      "Accommodation",
      "All meals (as per program)",
      "Experiential activities as listed",
      "Local guide",
      "All transfers",
      "All applicable taxes",
    ],
    exclusions: [
      "Airfare",
      "Personal expenses",
      "Optional add-ons",
      "Items not in the program",
    ],
  },
};

export function defaultsForCategory(cat: string): CategoryDefaults {
  return D[cat] ?? { inclusions: [], exclusions: [] };
}
