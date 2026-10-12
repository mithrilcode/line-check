/**
 * Texas configuration.
 * Source: Texas Food Establishment Rules (25 TAC Chapter 228), which most city
 * and county health departments adopt. Local departments set permit terms and fees.
 */
(function (LC) {
  "use strict";

  const COOKING = "Cooking (final internal temp)";
  const SANITIZER = "Sanitizer & water";

  LC.config = {
    id: "tx",
    name: "Texas",

    /** Page copy. `{label}` in inspectionIntro is replaced with the priority badge. */
    text: {
      codeName: "Texas Food Establishment Rules",
      localityLabel: "City / county",
      localityPlaceholder: "e.g. Travis",
      coolingNote: "Hot food must drop from 135°F to 70°F within 2 hours, then to 41°F within 6 hours total.",
      inspectionIntro:
        "Walk the kitchen the way a health inspector would. Items marked {label} carry the heaviest demerits on a Texas inspection report and can lead to a closure.",
      footer:
        "Limits come from the Texas Food Establishment Rules (25 TAC Chapter 228), which most city and county health departments adopt and sometimes add to. Your local health department sets permit terms, fees and inspection scoring. Confirm anything you're unsure about with them. This tool helps you keep records; it isn't legal or tax advice.",
      priorityLabel: "Priority",
      priorityAllDone: "Every priority item is confirmed.",
      starterIntro:
        "renewals most Texas restaurants track: food establishment permit, Certified Food Manager and food handler certificates, TABC, sales and franchise tax, hood cleaning, fire suppression, grease, pest control and more.",
    },

    /** Spot checks offered in the reading log. A reading passes when min ≤ value ≤ max. */
    checks: [
      { key: "cook_poultry", group: COOKING, label: "Poultry or stuffed food", unit: "°F", min: 165, rule: "165°F or higher" },
      { key: "cook_ground", group: COOKING, label: "Ground meat or fish", unit: "°F", min: 155, rule: "155°F or higher for 17 seconds" },
      { key: "cook_whole", group: COOKING, label: "Whole-muscle meat, fish, eggs", unit: "°F", min: 145, rule: "145°F or higher for 15 seconds" },
      { key: "reheat", group: COOKING, label: "Reheat for hot holding", unit: "°F", min: 165, rule: "165°F within 2 hours" },
      { key: "chlorine", group: SANITIZER, label: "Sanitizer: chlorine", unit: "ppm", min: 50, max: 200, rule: "50–200 ppm" },
      { key: "quat", group: SANITIZER, label: "Sanitizer: quat", unit: "ppm", min: 200, max: 400, rule: "200–400 ppm, or the range on the label" },
      { key: "dish", group: SANITIZER, label: "Dish machine final rinse", unit: "°F", min: 180, rule: "180°F at the manifold (high-temp machine)" },
      { key: "handwash", group: SANITIZER, label: "Handwash sink water", unit: "°F", min: 100, rule: "100°F or higher" },
      { key: "calib", group: SANITIZER, label: "Thermometer ice-point check", unit: "°F", min: 30, max: 34, rule: "32°F ± 2°F in ice water" },
    ],

    shiftChecks: [
      {
        group: "Opening",
        items: [
          { id: "pic", text: "A person in charge is on duty and knows the 9 major food allergens" },
          { id: "soap", text: "Handwash sinks stocked with soap and paper towels, nothing stored in them" },
          { id: "hotwater", text: "Hot water at every sink" },
          { id: "sani", text: "Sanitizer buckets mixed and tested with strips" },
          { id: "health", text: "Staff asked about vomiting, diarrhea, jaundice, sore throat with fever" },
          { id: "probe", text: "Clean, calibrated probe thermometer on the line" },
          { id: "datemark", text: "Ready-to-eat food held over 24 hours is date-marked; anything past day 7 discarded" },
          { id: "pests", text: "No droppings, live insects or gnaw marks" },
        ],
      },
      {
        group: "Closing",
        items: [
          { id: "coolchk", text: "Every cooling batch checked and logged" },
          { id: "tphc", text: "Food held on time control discarded at its marked time" },
          { id: "clean", text: "Food-contact surfaces washed, rinsed, sanitized" },
          { id: "trash", text: "Trash out, dumpster lid closed, grease bin covered" },
          { id: "doors", text: "Back door closed, screens and air curtains working" },
        ],
      },
    ],

    /** Self-inspection walkthrough. `priority` items carry the heaviest demerits. */
    inspection: [
      {
        title: "Knowledge & permits",
        items: [
          { id: "p1", text: "Food establishment permit is current and posted where customers can see it" },
          { id: "p2", text: "At least one Certified Food Manager is employed and the certificate is posted" },
          { id: "p3", text: "Every food employee has an accredited food handler certificate (within 60 days of hire); copies are on file" },
          { id: "p4", text: "The person in charge can explain holding temps, cooling, date marking, allergens and the illness policy", priority: true },
        ],
      },
      {
        title: "Employee health & hygiene",
        items: [
          { id: "h1", text: "Staff know to report vomiting, diarrhea, jaundice and diagnosed illness; an employee health policy is in place", priority: true },
          { id: "h2", text: "Handwash sinks are accessible, stocked, used only for handwashing, and at 100°F or more", priority: true },
          { id: "h3", text: "No bare-hand contact with ready-to-eat food; gloves or utensils in use", priority: true },
          { id: "h4", text: "Hair restrained; staff drinks are covered and kept away from prep areas" },
        ],
      },
      {
        title: "Time & temperature",
        items: [
          { id: "t1", text: "Every cold-holding unit holds food at 41°F or below", priority: true },
          { id: "t2", text: "Hot-held food is at 135°F or above", priority: true },
          { id: "t3", text: "Cooling follows 135→70°F in 2 h, →41°F in 6 h, and the log shows it", priority: true },
          { id: "t4", text: "Food reheated for hot holding reaches 165°F within 2 hours", priority: true },
          { id: "t5", text: "Cooked foods reach required final temps and are spot-checked", priority: true },
          { id: "t6", text: "Ready-to-eat food held over 24 hours is date-marked and used within 7 days", priority: true },
          { id: "t7", text: "Any food on time control has written procedures and a marked discard time", priority: true },
          { id: "t8", text: "A working probe thermometer (accurate to ±2°F) is on hand" },
        ],
      },
      {
        title: "Protection from contamination",
        items: [
          { id: "c1", text: "Raw meat stored below and away from ready-to-eat food", priority: true },
          { id: "c2", text: "Food covered, labeled and stored at least 6 inches off the floor" },
          { id: "c3", text: "Wiping cloths are kept in sanitizer between uses" },
          { id: "c4", text: "Sanitizer is at the right strength and test strips are on hand", priority: true },
          { id: "c5", text: "Dish machine or 3-compartment sink reaches sanitizing temp or concentration", priority: true },
        ],
      },
      {
        title: "Sources & labeling",
        items: [
          { id: "a1", text: "All food comes from approved sources and invoices are kept", priority: true },
          { id: "a2", text: "Shellfish tags are kept for 90 days after the container is emptied" },
          { id: "a3", text: "Menu has a consumer advisory for raw or undercooked animal foods" },
          { id: "a4", text: "Working containers and bulk bins are labeled with the food's name" },
        ],
      },
      {
        title: "Facility & records",
        items: [
          { id: "f1", text: "Hot and cold running water; no sewage or drain backups", priority: true },
          { id: "f2", text: "No sign of rodents, roaches or flies", priority: true },
          { id: "f3", text: "Chemicals are labeled and stored below and away from food", priority: true },
          { id: "f4", text: "Restrooms are clean, stocked and have self-closing doors" },
          { id: "f5", text: "Pest control reports, grease trap manifests and hood cleaning tags are on file" },
          { id: "f6", text: "The last 90 days of temperature and cooling logs are easy to show" },
        ],
      },
    ],

    /** "Add starter list" on the Permits & renewals tab. */
    starter: [
      { name: "Food establishment permit", category: "permit", cycleMonths: 12, agency: "City or county health dept. (DSHS where there is none)", notes: "Most Texas cities and counties issue their own permit and set the term and fee." },
      { name: "Certified Food Manager certificate", category: "cert", cycleMonths: 60, agency: "Accredited exam provider", notes: "At least one CFM must be employed at each establishment. Valid 5 years." },
      { name: "Food handler certificates", category: "cert", cycleMonths: 24, agency: "Accredited food handler program", notes: "Each food employee, within 60 days of hire. Valid 2 years. Add one row per employee." },
      { name: "TABC permit renewal", category: "permit", cycleMonths: 24, agency: "Texas Alcoholic Beverage Commission", notes: "Only if you sell alcohol. Licenses and permits run on 2-year terms." },
      { name: "Sales tax return", category: "labor", cycleMonths: 3, agency: "Texas Comptroller", notes: "Due the 20th of the month after the period. The Comptroller sets monthly, quarterly or yearly filing." },
      { name: "Mixed beverage gross receipts tax", category: "labor", cycleMonths: 1, agency: "Texas Comptroller", notes: "Only with a mixed beverage permit. Due the 20th of each month." },
      { name: "Franchise tax report", category: "labor", cycleMonths: 12, agency: "Texas Comptroller", notes: "Due May 15 each year, even if no tax is owed." },
      { name: "Workers' comp non-coverage notice (DWC-005)", category: "labor", cycleMonths: 12, agency: "Texas Dept. of Insurance, DWC", notes: "Only if you don't carry workers' comp. File between Feb 1 and Apr 30." },
      { name: "Kitchen hood & duct cleaning", category: "fire", cycleMonths: 6, agency: "Hood cleaning contractor", notes: "NFPA 96: quarterly for high-volume (wok, charbroil, 24-hour), semiannual for moderate." },
      { name: "Fire suppression system inspection", category: "fire", cycleMonths: 6, agency: "State Fire Marshal-licensed contractor", notes: "Semiannual service tag on the hood system." },
      { name: "Portable fire extinguishers service", category: "fire", cycleMonths: 12, agency: "State Fire Marshal-licensed contractor", notes: "Annual service. Do a monthly visual check too, including the K-class unit." },
      { name: "Fire inspection", category: "fire", cycleMonths: 12, agency: "City fire marshal", notes: "Many Texas cities inspect restaurants yearly." },
      { name: "Grease trap pumping", category: "service", cycleMonths: 3, agency: "Registered grease hauler", notes: "Interval set by your city's grease program. Keep every manifest." },
      { name: "Backflow preventer test", category: "service", cycleMonths: 12, agency: "Licensed backflow tester", notes: "Annual test where your water utility requires it." },
      { name: "Pest control service", category: "service", cycleMonths: 1, agency: "Licensed pest control operator", notes: "Keep every service report for the inspector." },
      { name: "Labor law posters", category: "labor", cycleMonths: 12, agency: "Texas Workforce Commission / U.S. DOL", notes: "Check yearly that required federal and state notices are current." },
    ],

    /** Employee files (features/employees.js). */
    employees: {
      certTypes: {
        fh: { label: "Food handler (Texas accredited)", months: 24 },
        cfm: { label: "Certified Food Manager", months: 60 },
        tabc: { label: "TABC seller-server", months: 24 },
        allergen: { label: "Allergen awareness", months: 0 },
        other: { label: "Other certification", months: 0 },
      },
      /** Food handler card due within `dueDays` of hire; a valid `coveredBy` certificate also satisfies it. */
      handler: {
        type: "fh",
        coveredBy: "cfm",
        dueDays: 60,
        hint: "Texas food handler cards are due within 60 days of hire and last 2 years. A Certified Food Manager certificate also covers the food handler requirement.",
      },
      /** Flag for employees marked as serving alcohol. */
      alcohol: { type: "tabc", label: "TABC seller-server recommended" },
      onboarding: [
        { id: "i9", text: "Form I-9 completed", note: "Section 2 within 3 business days of the first day of work" },
        { id: "w4", text: "Form W-4 on file" },
        { id: "newhire", text: "New hire reported to the Texas Attorney General", note: "Within 20 days of hire" },
        { id: "health", text: "Signed employee health reporting agreement", note: "Symptoms and diagnoses they must report to the person in charge" },
        { id: "policies", text: "Handbook and kitchen policies acknowledged" },
      ],
    },
  };
})((window.LineCheck = window.LineCheck || {}));
